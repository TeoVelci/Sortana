
import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from './AppContext';

// --- Reusable Public Components ---

export const PublicNav: React.FC = () => (
  <nav className="fixed w-full z-50 bg-background-dark/80 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
              <div className="flex-shrink-0 flex items-center gap-2 cursor-pointer">
                  <Link to="/" className="flex items-center gap-2">
                      <span className="text-3xl font-black tracking-tighter text-primary">S</span>
                  </Link>
              </div>
              <div className="flex items-center space-x-6">
                  <Link className="text-sm font-medium text-text-muted-dark hover:text-primary transition-colors" to="/pricing">Pricing</Link>
                  <Link className="text-sm font-medium text-text-muted-dark hover:text-primary transition-colors" to="/login">Login</Link>
                  <Link className="bg-primary hover:bg-primary-hover text-white text-sm font-semibold py-2 px-4 rounded-md transition-colors shadow-lg shadow-primary/30" to="/signup">
                      Get Started
                  </Link>
              </div>
          </div>
      </div>
  </nav>
);

export const PublicFooter: React.FC = () => (
  <footer className="bg-background-dark border-t border-gray-800 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center">
          <p className="text-gray-500 text-sm mb-4">© 2025 Sortana AI. All Rights Reserved.</p>
          <div className="flex space-x-6 text-sm">
              <Link className="text-gray-500 hover:text-white transition-colors" to="/pricing">Pricing</Link>
              <Link className="text-gray-500 hover:text-white transition-colors" to="/terms">Terms of Service</Link>
              <Link className="text-gray-500 hover:text-white transition-colors" to="/privacy">Privacy Policy</Link>
          </div>
      </div>
  </footer>
);

// --- Main Landing Page ---

const LandingPage: React.FC = () => {
  const { isAuthenticated } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="bg-background-light dark:bg-background-dark text-text-main-light dark:text-text-main-dark font-sans antialiased dark selection:bg-primary selection:text-white">

      <PublicNav />

      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 z-0">
              <img alt="Serene workflow environment" className="w-full h-full object-cover opacity-30 blur-sm" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDexCzyMDfOGy92xriDfQbSxSmZGJdmlZuMSJSk3a-OERyNF04KorMsB7x5ZZJ_4_ubTdooH2pp5Uy45Fx0RteoUULAvqZEVFTxlDBBj-Eqtblj9igCo3eryZrFhkBmjeI9KEOaZKQQTgLXQjhtBeqjyRd7X1qv84xOoXUYcrgacNhEBUQ3R26U5EZLnKuoM3l3dFa3epd6YLQGpy9Ru_tixpTiXyyzFCslmIZZwb12FQ7evffx871HNJ0vYS8F-BoqVeI458-MLfM"/>
              <div className="absolute inset-0 bg-gradient-to-t from-background-dark via-background-dark/70 to-transparent"></div>
              <div className="absolute inset-0 bg-gradient-to-r from-background-dark/50 to-transparent"></div>
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10 animate-fadeIn">
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight leading-tight mb-8 text-white drop-shadow-lg">
                  NEVER WASTE A MINUTE <br className="hidden md:block"/>
                  MANAGING MEDIA AGAIN.
              </h1>
              <p className="mt-4 max-w-3xl mx-auto text-lg md:text-xl text-text-muted-dark leading-relaxed drop-shadow-md">
                  Sortana AI uses artificial intelligence to automatically cull, tag, edit, and secure your entire photo & video library, so you can get back to <span className="text-primary font-medium">creating</span>.
              </p>
              <div className="mt-12 flex flex-col items-center gap-4">
                  <Link className="btn-glow bg-primary text-white font-bold py-4 px-10 rounded-lg text-xl uppercase tracking-wider hover:bg-primary-hover transform transition-transform duration-300" to="/signup">
                      Get Started For Free
                  </Link>
                  <p className="text-xs text-gray-500 mt-2">No credit card required. Free tier available.</p>
              </div>
          </div>
      </section>

      {/* Scrolling Reviews Section */}
      <div className="py-12 bg-background-dark border-t border-gray-900 overflow-hidden">
          <div className="container mx-auto px-6 mb-8 text-center">
              <p className="text-sm font-bold tracking-widest text-text-muted-dark uppercase mb-2">TRUSTED BY MODERN PHOTOGRAPHERS</p>
          </div>

          <div className="scroll-container w-full max-w-[100vw] overflow-hidden relative">
              <div className="scrolling-wrapper gap-6 px-6 flex animate-scroll hover:pause">
                  {/* Reviews Data */}
                  {[
                    { quote: "Sortana saved my weekend. I used to spend Sundays manually culling thousands of wedding shots.", author: "Sarah Jenkins", role: "Wedding Photographer", color: "bg-blue-500", initials: "SJ" },
                    { quote: "I was skeptical about AI tagging, but it's scary accurate. It found all my 'golden hour' shots instantly.", author: "Mark Daniels", role: "Landscape Artist", color: "bg-green-500", initials: "MD" },
                    { quote: "The video analysis is insane. It found every clip where the bride was laughing without me even asking.", author: "Elena Rodriguez", role: "Studio Lead", color: "bg-purple-500", initials: "ER" },
                    { quote: "This tool paid for itself in the first hour. My workflow is literally 10x faster.", author: "David Chen", role: "Event Photographer", color: "bg-red-500", initials: "DC" },
                    // Duplicates for loop
                    { quote: "Sortana saved my weekend. I used to spend Sundays manually culling thousands of wedding shots.", author: "Sarah Jenkins", role: "Wedding Photographer", color: "bg-blue-500", initials: "SJ" },
                    { quote: "I was skeptical about AI tagging, but it's scary accurate. It found all my 'golden hour' shots instantly.", author: "Mark Daniels", role: "Landscape Artist", color: "bg-green-500", initials: "MD" },
                    { quote: "The video analysis is insane. It found every clip where the bride was laughing without me even asking.", author: "Elena Rodriguez", role: "Studio Lead", color: "bg-purple-500", initials: "ER" },
                    { quote: "This tool paid for itself in the first hour. My workflow is literally 10x faster.", author: "David Chen", role: "Event Photographer", color: "bg-red-500", initials: "DC" },
                  ].map((review, i) => (
                    <div key={i} className="w-80 md:w-96 bg-surface-dark p-6 rounded-xl border border-gray-800 flex-shrink-0 shadow-lg">
                        <div className="flex items-center mb-4 text-yellow-400">
                            {[1,2,3,4,5].map(s => <span key={s} className="material-symbols-outlined fill-1 text-sm">star</span>)}
                        </div>
                        <p className="text-text-muted-dark mb-6 text-sm italic">"{review.quote}"</p>
                        <div className="flex items-center">
                            <div className={`w-8 h-8 rounded-full ${review.color} flex items-center justify-center text-xs font-bold mr-3 text-white`}>{review.initials}</div>
                            <div>
                                <div className="font-bold text-sm text-white">{review.author}</div>
                                <div className="text-xs text-gray-500">{review.role}</div>
                            </div>
                        </div>
                    </div>
                  ))}
              </div>
          </div>
      </div>

      {/* Workflow Section */}
      <section className="py-24 bg-background-dark">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-4xl md:text-5xl font-extrabold text-center mb-16 text-white leading-tight">
                  Your Workflow, Reimagined in 3 Seamless Steps.
              </h2>
              <div className="space-y-16">
                  {/* Step 1 */}
                  <div className="relative overflow-hidden rounded-3xl min-h-[400px] flex items-end p-8 md:p-12 shadow-2xl gradient-workflow-1 transform transition-transform duration-300 hover:scale-105 hover:shadow-2xl">
                      <img alt="Upload interface" className="absolute inset-0 w-full h-full object-cover opacity-60" src="https://lh3.googleusercontent.com/aida-public/AB6AXuD0RAVeLlhgtvgV0EcPzS6ERMRpuNJv_KYdRfCSuZ88vLQUcuMml2FaEVzm-kxaAQtC5zr6i0Uf1RhRX8t9aq-U8rmvP3tpXAeCepqEsbpzOuQc8V7BBoC9jNbSIOeu_OfOVZjwGRgRJulaXFy5_T46m1it9riP0z2y-xZ3JrcSmS5_oih7eWEYUcts0zdO_n4YsO4nkVH5RbdNby_cUz79HMCwYqJncHS9Dq2bStxALK4mF2hJZ1BznSkfbLV33NG9lFBIbFRLIgU"/>
                      <div className="workflow-image-overlay"></div>
                      <div className="relative z-20 max-w-2xl text-white mt-8 p-6 bg-black/40 backdrop-blur-sm rounded-xl border border-white/10">
                          <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center text-white text-2xl font-bold mb-6 shadow-xl shadow-primary/40">1</div>
                          <h3 className="text-3xl md:text-4xl font-extrabold mb-4 leading-tight">Upload Your Shoot</h3>
                          <p className="text-lg md:text-xl text-text-muted-dark leading-relaxed">
                              Drag and drop your entire memory card. RAWs, JPEGs, videos—we handle it all. Our system intelligently ingests your media, preparing it for AI processing.
                          </p>
                      </div>
                  </div>
                  {/* Step 2 */}
                  <div className="relative overflow-hidden rounded-3xl min-h-[400px] flex items-end p-8 md:p-12 shadow-2xl gradient-workflow-2 transform transition-transform duration-300 hover:scale-105 hover:shadow-2xl">
                      <img alt="AI processing" className="absolute inset-0 w-full h-full object-cover opacity-60" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDw1Vz0-4e97uTHQbkJ6mJfIDkhd3BYAuTk2VfixdAC0UtTSAX5sqKe3lWKCH3ofoe7kN5_DaqLALKL_lojVvdvmhDKmHdF5_DwHkaPdHWAvWJL24lbNlJ3Gt805akncFxOe8IArzfJmrZCeu5RmDd4_ns7TTCCfJXfugNs7aTYEL0xdqCDH0worNSIYemq2fZdTEwKoJAtZi9A_BaZdPQnGwMJjdZ36SlafBJ0EATi-VV97YDbkzn5kmctwGvlPbyb03Umxztqf6A"/>
                      <div className="workflow-image-overlay"></div>
                      <div className="relative z-20 max-w-2xl text-white mt-8 p-6 bg-black/40 backdrop-blur-sm rounded-xl border border-white/10">
                          <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center text-white text-2xl font-bold mb-6 shadow-xl shadow-primary/40">2</div>
                          <h3 className="text-3xl md:text-4xl font-extrabold mb-4 leading-tight">Let AI Do The Work</h3>
                          <p className="text-lg md:text-xl text-text-muted-dark leading-relaxed">
                              Our advanced AI watches your videos and analyzes your photos. It automatically restructures folders, generates summaries, and highlights key moments.
                          </p>
                      </div>
                  </div>
                  {/* Step 3 */}
                  <div className="relative overflow-hidden rounded-3xl min-h-[400px] flex items-end p-8 md:p-12 shadow-2xl gradient-workflow-3 transform transition-transform duration-300 hover:scale-105 hover:shadow-2xl">
                      <img alt="Cloud library" className="absolute inset-0 w-full h-full object-cover opacity-60" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDNol_8PkhKPgpCGYPdbpOzdKmP9_H74wCXmldLygzd6Mv71AcmIuO0Heu-D6Aqr8GSq2-bxIqYXZZM6foZni6FDBR6uIrmqotFtF_1F0ebfqT1q9a2SYIpsjkloDDlPKeB1SU35b83Oi9V2qKbzMG29CzSGc6sOZwOUpc-xsuBdNv9-fuCKKaBdpCMdkbvIfoMBsrHW1YwiWtr_NrXLuyPCV2rgLzOHsqTZki9dhzCyhFjraN9MTVM6Pi9QZ0XrA9ozua39_IQYz8"/>
                      <div className="workflow-image-overlay"></div>
                      <div className="relative z-20 max-w-2xl text-white mt-8 p-6 bg-black/40 backdrop-blur-sm rounded-xl border border-white/10">
                          <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center text-white text-2xl font-bold mb-6 shadow-xl shadow-primary/40">3</div>
                          <h3 className="text-3xl md:text-4xl font-extrabold mb-4 leading-tight">Access & Create</h3>
                          <p className="text-lg md:text-xl text-text-muted-dark leading-relaxed">
                              Your perfectly organized, securely stored library is now at your fingertips. Chat with Copilot to find files or use the Magic Editor to perfect them instantly.
                          </p>
                      </div>
                  </div>
              </div>
              
              <div className="mt-16 text-center">
                  <Link to="/pricing" className="btn-glow inline-block bg-primary text-white font-bold py-4 px-10 text-xl rounded-xl border border-indigo-400/30 hover:bg-primary-hover transition-transform duration-300 transform hover:-translate-y-1 shadow-[0_0_15px_rgba(99,102,241,0.5)]">
                      Check out our pricing plans
                  </Link>
              </div>
          </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-background-dark">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-16">
                  <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4 leading-tight">Stop Fighting Your Hard Drives.</h2>
                  <p className="text-lg text-text-muted-dark max-w-3xl mx-auto">Sortana AI was built to solve the most tedious, time-consuming parts of being a creator.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12">
                  <div className="flex items-start gap-5">
                      <div className="flex-shrink-0 mt-1">
                          <span className="material-symbols-outlined text-primary text-4xl fill-1">account_tree</span>
                      </div>
                      <div>
                          <h3 className="text-2xl font-bold text-white mb-2">Smart Folder Restructuring</h3>
                          <p className="text-text-muted-dark text-lg leading-relaxed">
                              Dump a chaotic SD card, and let AI automatically restructure it into neat 'Event' or 'Camera' based folders. Your hierarchy, handled.
                          </p>
                      </div>
                  </div>
                  <div className="flex items-start gap-5">
                      <div className="flex-shrink-0 mt-1">
                          <span className="material-symbols-outlined text-primary text-4xl fill-1">movie</span>
                      </div>
                      <div>
                          <h3 className="text-2xl font-bold text-white mb-2">Deep Video Analysis</h3>
                          <p className="text-text-muted-dark text-lg leading-relaxed">
                              We don't just store videos; we watch them. AI extracts key moments, generates summaries, and makes every frame searchable by content.
                          </p>
                      </div>
                  </div>
                  <div className="flex items-start gap-5">
                      <div className="flex-shrink-0 mt-1">
                          <span className="material-symbols-outlined text-primary text-4xl fill-1">chat_bubble</span>
                      </div>
                      <div>
                          <h3 className="text-2xl font-bold text-white mb-2">Sortana Copilot</h3>
                          <p className="text-text-muted-dark text-lg leading-relaxed">
                              Your Personal AI Assistant. Chat with your library to find "the best sunset shots" or "videos from the beach" instantly.
                          </p>
                      </div>
                  </div>
                  <div className="flex items-start gap-5">
                      <div className="flex-shrink-0 mt-1">
                          <span className="material-symbols-outlined text-primary text-4xl fill-1">auto_fix_high</span>
                      </div>
                      <div>
                          <h3 className="text-2xl font-bold text-white mb-2">Generative Magic Editor</h3>
                          <p className="text-text-muted-dark text-lg leading-relaxed">
                              Transform your images with simple text prompts. Change lighting, add elements, or restyle photos in seconds using Gemini AI.
                          </p>
                      </div>
                  </div>
              </div>
          </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 bg-background-dark">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-4xl font-extrabold text-center mb-16 text-white">Frequently Asked Questions</h2>
              <div className="space-y-6">
                  {/* FAQ 1 */}
                  <details className="group bg-surface-dark border border-gray-800 rounded-xl shadow-lg">
                      <summary className="flex justify-between items-center font-semibold cursor-pointer list-none p-6 text-white text-lg">
                          <span>How does the AI actually organize my files?</span>
                          <span className="transition group-open:rotate-180">
                              <span className="material-symbols-outlined text-primary">expand_more</span>
                          </span>
                      </summary>
                      <div className="text-text-muted-dark mt-0 px-6 pb-6 text-base leading-relaxed flex flex-col items-start gap-4">
                          <p>Sortana uses "Smart Ingest" to analyze file metadata (like Camera Model and Date) and visual content. It automatically creates a clean, logical folder hierarchy (e.g., <i>Sony A7III &gt; 2023 &gt; Wedding</i>), so you never have to drag and drop manually again.</p>
                          <Link to="/signup" className="btn-glow inline-block bg-primary text-white font-bold py-3 px-8 text-lg rounded-lg hover:bg-primary-hover transition-transform duration-300 transform hover:-translate-y-1">
                              Start Organizing
                          </Link>
                      </div>
                  </details>
                  {/* FAQ 2 */}
                  <details className="group bg-surface-dark border border-gray-800 rounded-xl shadow-lg">
                      <summary className="flex justify-between items-center font-semibold cursor-pointer list-none p-6 text-white text-lg">
                          <span>Can I search for specific objects, like "wedding cake" or "sunset"?</span>
                          <span className="transition group-open:rotate-180">
                              <span className="material-symbols-outlined text-primary">expand_more</span>
                          </span>
                      </summary>
                      <div className="text-text-muted-dark mt-0 px-6 pb-6 text-base leading-relaxed flex flex-col items-start gap-4">
                          <p>Yes! You don't need to manually tag anything. Our multimodal AI scans every photo and video frame, allowing you to search for objects, colors, actions, or even abstract concepts immediately after upload.</p>
                          <Link to="/signup" className="btn-glow inline-block bg-primary text-white font-bold py-3 px-8 text-lg rounded-lg hover:bg-primary-hover transition-transform duration-300 transform hover:-translate-y-1">
                              Try AI Search
                          </Link>
                      </div>
                  </details>
                  {/* FAQ 3 */}
                  <details className="group bg-surface-dark border border-gray-800 rounded-xl shadow-lg">
                      <summary className="flex justify-between items-center font-semibold cursor-pointer list-none p-6 text-white text-lg">
                          <span>What does the "Deep Video Analysis" feature do?</span>
                          <span className="transition group-open:rotate-180">
                              <span className="material-symbols-outlined text-primary">expand_more</span>
                          </span>
                      </summary>
                      <div className="text-text-muted-dark mt-0 px-6 pb-6 text-base leading-relaxed flex flex-col items-start gap-4">
                          <p>Unlike standard cloud storage, Sortana watches your videos. It generates textual summaries, identifies key moments with timestamps, and allows you to search for specific content inside your video clips.</p>
                          <Link to="/signup" className="btn-glow inline-block bg-primary text-white font-bold py-3 px-8 text-lg rounded-lg hover:bg-primary-hover transition-transform duration-300 transform hover:-translate-y-1">
                              Try Video Intelligence
                          </Link>
                      </div>
                  </details>
                  {/* FAQ 4 */}
                  <details className="group bg-surface-dark border border-gray-800 rounded-xl shadow-lg">
                      <summary className="flex justify-between items-center font-semibold cursor-pointer list-none p-6 text-white text-lg">
                          <span>Does the Magic Editor replace Photoshop?</span>
                          <span className="transition group-open:rotate-180">
                              <span className="material-symbols-outlined text-primary">expand_more</span>
                          </span>
                      </summary>
                      <div className="text-text-muted-dark mt-0 px-6 pb-6 text-base leading-relaxed flex flex-col items-start gap-4">
                          <p>The Magic Editor is designed for rapid, generative changes using simple text prompts like changing lighting, adding elements, or stylizing an image. It's perfect for quick creative iterations directly in your browser.</p>
                          <Link to="/signup" className="btn-glow inline-block bg-primary text-white font-bold py-3 px-8 text-lg rounded-lg hover:bg-primary-hover transition-transform duration-300 transform hover:-translate-y-1">
                              Try Magic Editor
                          </Link>
                      </div>
                  </details>
                  {/* FAQ 5 */}
                  <details className="group bg-surface-dark border border-gray-800 rounded-xl shadow-lg">
                      <summary className="flex justify-between items-center font-semibold cursor-pointer list-none p-6 text-white text-lg">
                          <span>Is there a money back guarantee?</span>
                          <span className="transition group-open:rotate-180">
                              <span className="material-symbols-outlined text-primary">expand_more</span>
                          </span>
                      </summary>
                      <div className="text-text-muted-dark mt-0 px-6 pb-6 text-base leading-relaxed flex flex-col items-start gap-4">
                          <p>Absolutely! We offer a 14 day no questions asked money back guarantee on all paid plans, so you can try the Pro features risk free.</p>
                          <Link to="/signup" className="btn-glow inline-block bg-primary text-white font-bold py-3 px-8 text-lg rounded-lg hover:bg-primary-hover transition-transform duration-300 transform hover:-translate-y-1">
                              Start Risk Free Trial
                          </Link>
                      </div>
                  </details>
                  {/* FAQ 6 */}
                  <details className="group bg-surface-dark border border-gray-800 rounded-xl shadow-lg">
                      <summary className="flex justify-between items-center font-semibold cursor-pointer list-none p-6 text-white text-lg">
                          <span>How do I get started?</span>
                          <span className="transition group-open:rotate-180">
                              <span className="material-symbols-outlined text-primary">expand_more</span>
                          </span>
                      </summary>
                      <div className="text-text-muted-dark mt-0 px-6 pb-6 text-base leading-relaxed flex flex-col items-start gap-4">
                          <p>Just click the "Get Started" button below to create your free account. You'll get 2GB of storage on us to test the Smart Ingest and AI tagging features immediately.</p>
                          <Link to="/signup" className="btn-glow inline-block bg-primary text-white font-bold py-3 px-8 text-lg rounded-lg hover:bg-primary-hover transition-transform duration-300 transform hover:-translate-y-1">
                              Get Started
                          </Link>
                      </div>
                  </details>
              </div>
          </div>
      </section>

      {/* Final CTA */}
      <section className="py-28 bg-gradient-to-br from-[#100B26] to-[#200A38] text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuA2d-2lkZU1h8TienphI1JyScheNL4HIo6qQ_D_2yiGnQZITVDVMmsDliS9qTprdDYKW7M-Pmc3E3sDO5LNHvt4gqMaFiF-TOWUGU2JLLVbfwaeE3jLxQ4lv_TijaAllNOd0IlrtxQEgE7bShVL3iCSaCM0w5pQJrjH1MAVWR1ViqlhLk7klPO_gelIzDPJiRRf-a1voNW1oidrf38_CQ01XJ1N2GU7YjareRNFi_nbiX6j5DQoiKZGyImPZ3dfwZQQ6tfDm43x0_8')" }}></div>
          <div className="max-w-4xl mx-auto px-4 relative z-10">
              <h2 className="text-4xl md:text-6xl font-extrabold text-white mb-8 leading-tight drop-shadow-lg">
                  Ready to Transform Your Workflow?
              </h2>
              <p className="text-gray-300 text-xl mb-12 max-w-2xl mx-auto leading-relaxed">
                  Spend less time managing files and more time creating beautiful, impactful images. Your first 5GB of storage are on us — no credit card needed.
              </p>
              <Link className="btn-glow inline-block bg-primary text-white font-bold py-4 px-12 rounded-lg text-xl hover:bg-primary-hover transition-transform duration-300 transform hover:-translate-y-1" to="/signup">
                  Claim Your Free Account
              </Link>
          </div>
      </section>

      <PublicFooter />

    </div>
  );
};

export default LandingPage;
