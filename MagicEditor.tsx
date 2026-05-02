import React, { useState, useEffect } from 'react';
import { FileSystemItem, useApp } from './AppContext';
import { editImageWithAI } from './aiService';
import { useToast } from './ToastContext';
import { getPublicUrl } from './storageService';

interface MagicEditorProps {
  item: FileSystemItem;
  onClose: () => void;
  onSave: (blob: Blob, newName: string) => void;
}

const PRESETS = [
  { label: 'Cinematic', prompt: 'Make the lighting cinematic and dramatic, high contrast' },
  { label: 'B&W Art', prompt: 'Convert to high contrast black and white artistic photography' },
  { label: 'Cyberpunk', prompt: 'Apply a cyberpunk aesthetic with neon pink and blue lighting' },
  { label: 'Golden Hour', prompt: 'Enhance the lighting to look like golden hour sunset' },
  { label: 'Vintage', prompt: 'Apply a vintage 1970s film grain and color grade' },
];

const MagicEditor: React.FC<MagicEditorProps> = ({ item, onClose, onSave }) => {
  const { showToast } = useToast();
  const { analyzeVideoItem } = useApp();
  
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false); // True when user holds "Compare"

  const isVideo = item.fileType === 'video';

  const handleGenerate = async () => {
    if (isVideo) {
        handleAnalyzeVideo();
        return;
    }
    if (!prompt.trim() || !item.previewUrl) return;

    setIsGenerating(true);
    setGeneratedImage(null);
    try {
        const resultBase64 = await editImageWithAI(item.previewUrl, prompt);
        setGeneratedImage(resultBase64);
        showToast("Magic Edit complete!", "success");
    } catch (error) {
        showToast("Failed to generate image. Try again.", "error");
    } finally {
        setIsGenerating(false);
    }
  };

  const handleAnalyzeVideo = async () => {
      setIsGenerating(true);
      try {
          await analyzeVideoItem(item.id);
          showToast("Video analysis complete! Check the metadata in Browse view.", "success");
          onClose();
      } catch (e) {
          showToast("Video analysis failed.", "error");
      } finally {
          setIsGenerating(false);
      }
  };

  const handlePresetClick = (presetPrompt: string) => {
      setPrompt(presetPrompt);
      // Optional: Auto-submit on preset click? Let's just fill for now to let user refine.
  };

  const handleSave = async () => {
      if (!generatedImage) return;

      try {
          // Convert base64 back to Blob for saving
          const res = await fetch(generatedImage);
          const blob = await res.blob();
          
          // Construct new name
          const namePart = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
          const ext = item.name.split('.').pop() || 'jpg';
          const newName = `${namePart}_AI_Edit.${ext}`;
          
          onSave(blob, newName);
          onClose();
      } catch (e) {
          console.error(e);
          showToast("Failed to save image", "error");
      }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-in fade-in duration-300">
        
        {/* --- Top Bar --- */}
        <div className="h-16 border-b border-white/10 flex justify-between items-center px-6 bg-dark-900 shrink-0">
            <div className="flex items-center gap-3">
                <i className="fa-solid fa-wand-magic-sparkles text-brand-purple text-xl"></i>
                <h2 className="text-lg font-bold text-white">Magic Editor</h2>
                <span className="text-gray-500 text-sm hidden md:inline">| {item.name}</span>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white">
                <i className="fa-solid fa-xmark"></i>
            </button>
        </div>

        {/* --- Main Canvas --- */}
        <div className="flex-1 relative flex items-center justify-center p-6 overflow-hidden">
            
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-20 pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(circle at center, #1e3a8a 0%, #000 70%)' }}>
            </div>

            {/* Image Container */}
            <div 
                className="relative max-w-full max-h-full shadow-2xl rounded-lg overflow-hidden border border-white/10 group select-none"
                onContextMenu={(e) => e.preventDefault()}
            >
                {/* Original Content (Always underneath) */}
                {isVideo ? (
                    <div className="relative flex justify-center items-center h-full w-full bg-black">
                        <video 
                            src={getPublicUrl(item.proxyS3Key || item.s3Key!)}
                            controls
                            className="max-w-full max-h-[calc(100vh-280px)] object-contain"
                        />
                    </div>
                ) : (
                    <img 
                        src={item.previewUrl} 
                        alt="Original" 
                        className="max-w-full max-h-[calc(100vh-280px)] object-contain"
                    />
                )}
                
                {/* Generated Image (On top, toggled by isComparing) */}
                {generatedImage && (
                    <img 
                        src={generatedImage} 
                        alt="Edited" 
                        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-100 ${isComparing ? 'opacity-0' : 'opacity-100'}`}
                    />
                )}
                
                {/* Compare Badge */}
                {generatedImage && (
                    <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-white border border-white/20 pointer-events-none z-20">
                        {isComparing ? 'ORIGINAL' : 'EDITED'}
                    </div>
                )}

                {/* Loading Overlay */}
                {isGenerating && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-30">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full border-4 border-brand-purple/30 border-t-brand-purple animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <i className="fa-solid fa-wand-magic-sparkles text-brand-purple animate-pulse"></i>
                            </div>
                        </div>
                        <p className="mt-4 text-brand-glow font-medium animate-pulse">Gemini is dreaming...</p>
                    </div>
                )}
            </div>

            {/* Compare Button (Floating) */}
            {generatedImage && !isGenerating && (
                 <button 
                    className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white px-6 py-2 rounded-full font-medium text-sm border border-white/20 transition-all active:scale-95 select-none z-40"
                    onMouseDown={() => setIsComparing(true)}
                    onMouseUp={() => setIsComparing(false)}
                    onMouseLeave={() => setIsComparing(false)}
                    onTouchStart={(e) => { e.preventDefault(); setIsComparing(true); }}
                    onTouchEnd={(e) => { e.preventDefault(); setIsComparing(false); }}
                    onContextMenu={(e) => e.preventDefault()}
                 >
                    Hold to Compare
                 </button>
            )}

        </div>

        {/* --- Controls Bar --- */}
        <div className="bg-dark-800 border-t border-white/10 p-6 shrink-0">
            <div className="max-w-4xl mx-auto flex flex-col gap-4">
                
                {/* Presets */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {PRESETS.map((p, i) => (
                        <button 
                            key={i}
                            onClick={() => handlePresetClick(p.prompt)}
                            className="whitespace-nowrap px-3 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-300 text-xs font-medium border border-white/5 transition-colors"
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* Input Area */}
                <div className="flex gap-3">
                    {!isVideo && (
                        <div className="flex-1 relative">
                            <input 
                                type="text" 
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="How would you like to change this image?"
                                className="w-full bg-dark-900 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-brand-purple"
                                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                            />
                            <i className="fa-solid fa-pen-nib absolute right-4 top-3.5 text-gray-600"></i>
                        </div>
                    )}
                    
                    <button 
                        onClick={handleGenerate}
                        disabled={isGenerating || (!isVideo && !prompt.trim())}
                        className="bg-brand-purple hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold transition-all shadow-neon flex items-center gap-2"
                    >
                        <i className="fa-solid fa-wand-magic-sparkles"></i>
                        <span>{isVideo ? 'Deep AI Analysis' : 'Generate'}</span>
                    </button>

                    {generatedImage && (
                        <div className="w-px h-12 bg-white/10 mx-2"></div>
                    )}

                    {generatedImage && (
                        <button 
                            onClick={handleSave}
                            className="bg-white text-dark-900 hover:bg-gray-200 px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2"
                        >
                            <i className="fa-solid fa-floppy-disk"></i>
                            <span>Save Copy</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default MagicEditor;