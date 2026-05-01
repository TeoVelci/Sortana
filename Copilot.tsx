
import React, { useState, useEffect, useRef, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from './AppContext';
import { initializeCopilotChat, prepareImageForAI, ImagePayload, isValidImageForAnalysis } from './aiService';
import { Chat } from "@google/genai";

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  toolUsed?: string;
  attachmentPreview?: string; // Data URL for display
}

interface Attachment {
    file: File;
    preview: string;
    payload?: ImagePayload;
}

const Copilot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'model', text: 'Hi! I\'m Sortana Copilot. Drag an image here to ask questions about it, or ask me to organize your files.' }
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  
  // Drag & Drop State
  const [isDragOver, setIsDragOver] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<Chat | null>(null);

  const { items, setViewState, createFolder, storage, formatSize, resetFilters, getFileObject, user } = useApp();
  const navigate = useNavigate();

  const hasVision = ['Pro', 'Studio'].includes(user.plan);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // Init Chat
  useEffect(() => {
    try {
        chatRef.current = initializeCopilotChat();
    } catch (e) {
        console.error("Failed to init chat", e);
    }
  }, []);

  // --- Handlers: Drag & Drop ---
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);

      if (!hasVision) {
          setMessages(prev => [...prev, { 
              id: Date.now().toString(), 
              role: 'model', 
              text: "🔒 Image analysis is a Pro feature. Please upgrade your plan to unlock multimodal capabilities." 
          }]);
          if (!isOpen) setIsOpen(true);
          return;
      }

      // Check for Internal Item ID first (Drag from Grid)
      const itemId = e.dataTransfer.getData('application/sortana-item-id');
      if (itemId) {
          const file = getFileObject(itemId);
          if (file) {
              await processAttachment(file);
              return;
          } else {
              // Graceful handling for mock items that have no file data
              setMessages(prev => [...prev, { 
                  id: Date.now().toString(), 
                  role: 'model', 
                  text: "Sorry, I can't analyze that sample image because the raw file isn't available in this session. Please upload your own photo to try Multimodal features." 
              }]);
              if (!isOpen) setIsOpen(true);
              return;
          }
      }

      // Check for External Files (Drag from Desktop)
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          await processAttachment(e.dataTransfer.files[0]);
      }
  };

  const processAttachment = async (file: File) => {
      // 1. Strict Validation for Chat Support
      if (!isValidImageForAnalysis(file)) {
          // Provide a helpful message instead of a crash error
          setMessages(prev => [...prev, { 
              id: Date.now().toString(), 
              role: 'model', 
              text: `I can't analyze this file type (${file.type || 'unknown'}). Please drag a standard image (JPG, PNG, HEIC) for visual questions.` 
          }]);
          if (!isOpen) setIsOpen(true);
          return;
      }

      // 2. Validate General Image Type (redundant but safe)
      if (!file.type.startsWith('image/')) {
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "I can only analyze images right now. Please drag a photo." }]);
          if (!isOpen) setIsOpen(true);
          return;
      }

      try {
          const payload = await prepareImageForAI(file);
          const preview = URL.createObjectURL(file);
          setAttachment({ file, preview, payload });
          if (!isOpen) setIsOpen(true);
      } catch (e) {
          console.error("Failed to process image attachment", e);
          setMessages(prev => [...prev, { 
              id: Date.now().toString(), 
              role: 'model', 
              text: "I couldn't read this image format. It might be corrupted or unsupported." 
          }]);
          if (!isOpen) setIsOpen(true);
      }
  };

  const removeAttachment = () => {
      if (attachment) URL.revokeObjectURL(attachment.preview);
      setAttachment(null);
  };

  // --- Handlers: Chat ---

  const handleSendMessage = async () => {
    if ((!input.trim() && !attachment) || !chatRef.current) return;
    
    const userMsg = input;
    const currentAttachment = attachment;

    setInput('');
    removeAttachment(); // Clear from input area, but keep reference for sending
    
    // Add User Message to UI
    setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'user', 
        text: userMsg,
        attachmentPreview: currentAttachment?.preview 
    }]);
    
    setIsThinking(true);

    try {
      // 1. Construct Message Payload
      let messagePayload: any = userMsg;
      
      // If image attached, use multimodal part structure
      if (currentAttachment && currentAttachment.payload) {
          messagePayload = [
              {
                  inlineData: {
                      mimeType: currentAttachment.payload.mimeType,
                      data: currentAttachment.payload.data
                  }
              },
              { text: userMsg || "Analyze this image." }
          ];
      }

      // 2. Send Message
      let response = await chatRef.current.sendMessage({ message: messagePayload });
      let toolNameUsed = undefined;
      
      // 3. Check for Function Calls
      const functionCalls = response.functionCalls;

      if (functionCalls && functionCalls.length > 0) {
          const functionResponseParts = [];

          for (const call of functionCalls) {
             toolNameUsed = call.name;
             const args = call.args as any;
             let result: any = { success: true };

             console.log(`Copilot calling tool: ${call.name}`, args);

             // Execute Logic
             switch (call.name) {
                 case 'set_filters':
                     setViewState({
                         filterRating: args.rating || 0,
                         filterFlag: args.flag || 'all',
                         searchQuery: args.search || ''
                     });
                     navigate('/browse');
                     result = { message: "Filters applied successfully." };
                     break;
                 
                 case 'create_folder':
                     createFolder(args.name);
                     navigate('/browse');
                     result = { message: `Folder '${args.name}' created.` };
                     break;
                
                 case 'list_projects': {
                     const folders = items.filter(i => i.type === 'folder').map(i => i.name);
                     result = { 
                         projects: folders.length > 0 ? folders : "No projects found.",
                         count: folders.length
                     };
                     break;
                 }

                 case 'navigate':
                     if (args.page === 'dashboard') navigate('/');
                     else if (args.page === 'browse') navigate('/browse');
                     else if (args.page === 'settings') navigate('/account');
                     else if (args.page === 'pricing') navigate('/pricing');
                     result = { message: `Navigated to ${args.page}.` };
                     break;

                 case 'get_storage_stats':
                     result = { 
                         used: formatSize(storage.usedBytes), 
                         limit: formatSize(storage.limitBytes),
                         percent: Math.round((storage.usedBytes / storage.limitBytes) * 100)
                     };
                     break;
             }

             // Construct Part for this function execution
             functionResponseParts.push({
                 functionResponse: {
                    id: call.id,
                    name: call.name,
                    response: { result: result }
                 }
             });
          }

          // Send Function Results back to Gemini
          response = await chatRef.current.sendMessage({ message: functionResponseParts });
      }

      const text = response.text || "I've completed that action.";
      setMessages(prev => [...prev, { 
          id: Date.now().toString(), 
          role: 'model', 
          text,
          toolUsed: toolNameUsed 
      }]);

    } catch (error) {
      console.error("Copilot Error:", error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <>
        {/* Updated "Pill" Toggle Button */}
        {!isOpen && (
            <button 
                id="copilot-trigger"
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-[60] group flex items-center gap-3 bg-black/60 dark:bg-black/60 backdrop-blur-xl text-white px-2 py-2 pr-5 rounded-full shadow-neon border border-white/10 hover:border-brand-purple/50 transition-all hover:scale-105"
            >
                <div className="w-10 h-10 rounded-full bg-brand-purple flex items-center justify-center shadow-lg group-hover:animate-pulse">
                    <i className="fa-solid fa-sparkles text-lg"></i>
                </div>
                <div className="flex flex-col items-start">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-300">Sortana</span>
                    <span className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">Copilot AI</span>
                </div>
            </button>
        )}

        {/* Chat Window */}
        {isOpen && (
            <div 
                className={`fixed bottom-6 right-6 z-[60] w-[90vw] md:w-[400px] h-[600px] max-h-[80vh] bg-white/95 dark:bg-dark-900/95 backdrop-blur-xl border-2 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300 ${isDragOver ? 'border-brand-purple bg-brand-purple/10' : 'border-white/20 dark:border-dark-600'}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* Drag Overlay */}
                {isDragOver && (
                    <div className="absolute inset-0 z-50 bg-brand-purple/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                        <div className="bg-dark-900/80 p-6 rounded-2xl border border-brand-purple flex flex-col items-center animate-bounce">
                            <i className="fa-solid fa-image text-4xl text-brand-purple mb-2"></i>
                            <span className="text-white font-bold">Drop image to analyze</span>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="p-4 border-b border-gray-200 dark:border-dark-600 bg-dark-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                         <div className="w-2.5 h-2.5 rounded-full bg-brand-purple shadow-[0_0_10px_rgba(99,102,241,0.8)] animate-pulse"></div>
                         <h3 className="font-bold text-gray-900 dark:text-white">Sortana Copilot</h3>
                         <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400 border border-white/5">BETA</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => resetFilters()} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors" title="Reset View">
                            <i className="fa-solid fa-rotate-left"></i>
                        </button>
                        <button onClick={() => setIsOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${
                                msg.role === 'user' 
                                ? 'bg-brand-purple text-white rounded-br-sm' 
                                : 'bg-gray-100 dark:bg-dark-800 text-gray-800 dark:text-gray-200 rounded-bl-sm border border-gray-200 dark:border-dark-700'
                            }`}>
                                {msg.toolUsed && (
                                    <div className="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b border-black/5 dark:border-white/5">
                                        <i className="fa-solid fa-bolt text-[10px] text-yellow-400"></i>
                                        <span className="text-[10px] font-mono opacity-70 uppercase tracking-wide">
                                            Ran Action: {msg.toolUsed.replace('_', ' ')}
                                        </span>
                                    </div>
                                )}
                                {msg.attachmentPreview && (
                                    <div className="mb-2 rounded-lg overflow-hidden border border-white/20">
                                        <img src={msg.attachmentPreview} alt="Attached" className="max-h-32 object-contain w-full" />
                                    </div>
                                )}
                                <div className="leading-relaxed">{msg.text}</div>
                            </div>
                        </div>
                    ))}
                    {isThinking && (
                        <div className="flex justify-start">
                            <div className="bg-gray-100 dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-2xl rounded-bl-sm p-4 flex gap-1">
                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white dark:bg-dark-900 border-t border-gray-200 dark:border-dark-600">
                    {/* Attachment Preview (Pending) */}
                    {attachment && (
                        <div className="flex items-center gap-3 mb-3 bg-gray-50 dark:bg-dark-800 p-2 rounded-lg border border-gray-200 dark:border-dark-700 animate-in slide-in-from-bottom-2">
                            <div className="w-10 h-10 rounded overflow-hidden shrink-0">
                                <img src={attachment.preview} className="w-full h-full object-contain" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{attachment.file.name}</p>
                                <p className="text-[10px] text-gray-500">Image attached</p>
                            </div>
                            <button onClick={removeAttachment} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-400">
                                <i className="fa-solid fa-xmark text-xs"></i>
                            </button>
                        </div>
                    )}

                    <div className="relative">
                        <textarea 
                            autoFocus
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            placeholder={!hasVision ? "Ask Copilot (Image drag locked on Basic/Free)" : "Ask Copilot or drag an image..."}
                            className="w-full bg-gray-100 dark:bg-dark-800 border-none rounded-xl py-3 pl-4 pr-12 text-sm focus:ring-1 focus:ring-brand-purple text-gray-900 dark:text-white resize-none max-h-32 placeholder-gray-500 scrollbar-hide"
                            rows={1}
                        />
                        <button 
                            onClick={handleSendMessage}
                            disabled={(!input.trim() && !attachment) || isThinking}
                            className="absolute right-2 bottom-2 p-1.5 bg-brand-purple text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 shadow-md"
                        >
                            <i className="fa-solid fa-paper-plane text-xs"></i>
                        </button>
                    </div>
                </div>
            </div>
        )}
    </>
  );
};

export default Copilot;
