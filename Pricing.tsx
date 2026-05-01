
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const Pricing: React.FC = () => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [activeFaq, setActiveFaq] = useState<string | null>(null);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const toggleFaq = (id: string) => {
    setActiveFaq(activeFaq === id ? null : id);
  };

  const isYearly = billingCycle === 'yearly';

  // Pricing Data
  const prices = {
    basic: { monthly: 9, yearly: 81 },
    pro: { monthly: 39, yearly: 351 },
    studio: { monthly: 199, yearly: 1791 }
  };

  return (
    <div className="flex flex-col items-center pt-8 pb-20 px-4 max-w-7xl mx-auto">
      {/* BEGIN: Hero Section */}
      <section className="text-center max-w-4xl mx-auto mb-12">
        <h1 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4 leading-tight">
          Simple pricing for creators who value their time.
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-lg md:text-xl font-normal">
          Let AI organize your photos and videos — automatically.
        </p>

        {/* Pricing Toggle */}
        <div className="flex items-center justify-center gap-3 mt-8">
          <span className={`text-sm font-medium ${!isYearly ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>Monthly</span>

          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer"
              checked={isYearly}
              onChange={() => setBillingCycle(isYearly ? 'monthly' : 'yearly')}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 dark:peer-focus:ring-primary/30 rounded-full peer dark:bg-dark-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-white/10 peer-checked:bg-primary"></div>
          </label>

          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${isYearly ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>Yearly</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-primary/20 dark:text-primary">
              Save 25%
            </span>
          </div>
        </div>
      </section>
      {/* END: Hero Section */}

      {/* BEGIN: Pricing Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto w-full px-4 items-start">

        {/* Card 1: Basic */}
        <article className="bg-white dark:bg-surface-dark rounded-xl shadow-card dark:shadow-none p-8 border border-gray-100 dark:border-white/10 flex flex-col h-full hover:shadow-lg transition-shadow duration-300">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Basic</h3>
          <div className="flex items-baseline mb-6">
            <span className="text-4xl font-bold text-gray-900 dark:text-white">
              ${isYearly ? prices.basic.yearly : prices.basic.monthly}
            </span>
            <span className="text-gray-500 dark:text-gray-400 ml-1">/{isYearly ? 'year' : 'month'}</span>
          </div>
          {/* Yearly Savings Text */}
          <div className={`text-xs font-semibold mb-4 h-6 flex items-center gap-2 transition-opacity ${isYearly ? 'opacity-100' : 'opacity-0'}`}>
            <span className="text-primary">Billed ${prices.basic.yearly} yearly</span>
            <span className="bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">25% OFF</span>
          </div>

          <ul className="space-y-4 mb-8 flex-grow">
            <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
              <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
              <span>50 GB Secure Storage</span>
            </li>
            <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
              <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
              <span>Auto AI Tagging</span>
            </li>
            <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
              <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
              <span>Smart Ingest & Organization</span>
            </li>
            <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
              <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
              <span>Duplicate Finder</span>
            </li>
          </ul>
          <button className="w-full py-3 px-4 border border-gray-300 dark:border-white/10 rounded-lg text-gray-900 dark:text-white font-semibold text-sm hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            Get Sortana Basic
          </button>
        </article>

        {/* Card 2: Pro (Highlighted) */}
        <article className="relative bg-white dark:bg-surface-dark rounded-xl shadow-2xl dark:shadow-none border-2 border-primary flex flex-col h-full transform scale-105 z-10 overflow-hidden">
          {/* Most Popular Banner */}
          <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-r from-primary to-indigo-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold uppercase tracking-wider">Most Popular</span>
          </div>
          <div className="p-8 pt-12 flex flex-col h-full">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Pro</h3>
            <div className="flex items-baseline mb-6">
              <span className="text-5xl font-bold text-gray-900 dark:text-white">
                ${isYearly ? prices.pro.yearly : prices.pro.monthly}
              </span>
              <span className="text-gray-500 dark:text-gray-400 ml-1">/{isYearly ? 'year' : 'month'}</span>
            </div>
            
            <div className={`text-xs font-semibold mb-4 h-6 flex items-center gap-2 transition-opacity ${isYearly ? 'opacity-100' : 'opacity-0'}`}>
              <span className="text-primary">Billed ${prices.pro.yearly} yearly</span>
              <span className="bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">25% OFF</span>
            </div>

            <ul className="space-y-4 mb-8 flex-grow">
              <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
                <span className="font-bold">Everything in Basic</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
                <span>1 TB Secure Storage</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
                <span>Magic Editor & Copilot Vision</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
                <span>Technical Auto-Organization</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
                <span>AI Smart Cleanup</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
                <span>Format Conversion & Renaming</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
                <span>XMP Metadata Export</span>
              </li>
            </ul>
            <button className="w-full py-3 px-4 bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold text-sm transition-colors shadow-md">
              Get Sortana Pro
            </button>
          </div>
        </article>

        {/* Card 3: Studio */}
        <article className="bg-white dark:bg-surface-dark rounded-xl shadow-card dark:shadow-none p-8 border border-gray-100 dark:border-white/10 flex flex-col h-full hover:shadow-lg transition-shadow duration-300">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Studio</h3>
          <div className="flex items-baseline mb-6">
            <span className="text-4xl font-bold text-gray-900 dark:text-white">
              ${isYearly ? prices.studio.yearly : prices.studio.monthly}
            </span>
            <span className="text-gray-500 dark:text-gray-400 ml-1">/{isYearly ? 'year' : 'month'}</span>
          </div>
          
          <div className={`text-xs font-semibold mb-4 h-6 flex items-center gap-2 transition-opacity ${isYearly ? 'opacity-100' : 'opacity-0'}`}>
            <span className="text-primary">Billed ${prices.studio.yearly} yearly</span>
            <span className="bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">25% OFF</span>
          </div>

          <ul className="space-y-4 mb-8 flex-grow">
            <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
              <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
              <span className="font-bold">Everything in Pro</span>
            </li>
            <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
              <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
              <span>5 TB Secure Storage</span>
            </li>
            <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
              <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
              <span>Deep Video Intelligence</span>
            </li>
            <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
              <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
              <span>Smart Event Clustering</span>
            </li>
             <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
              <i className="fa-solid fa-check mt-1 text-emerald-500"></i>
              <span>Export Watermarking</span>
            </li>
          </ul>
          <button className="w-full py-3 px-4 border border-gray-300 dark:border-white/10 rounded-lg text-gray-900 dark:text-white font-semibold text-sm hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
            Get Sortana Studio
          </button>
        </article>
      </section>
      {/* END: Pricing Cards */}

      {/* BEGIN: Features / Why Choose */}
      <section className="mt-24 max-w-5xl mx-auto w-full text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-12">Why choose Sortana AI?</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 px-4">
          <div className="flex flex-col items-center">
            <div className="mb-4 text-gray-400 dark:text-gray-500">
              <i className="fa-regular fa-clock text-3xl"></i>
            </div>
            <h4 className="font-semibold text-gray-900 dark:text-white leading-tight">Save hours<br/>every shoot</h4>
          </div>
          <div className="flex flex-col items-center">
            <div className="mb-4 text-gray-400 dark:text-gray-500">
              <i className="fa-regular fa-folder text-3xl"></i>
            </div>
            <h4 className="font-semibold text-gray-900 dark:text-white leading-tight">Find any media<br/>in seconds</h4>
          </div>
          <div className="flex flex-col items-center">
            <div className="mb-4 text-gray-400 dark:text-gray-500">
              <i className="fa-solid fa-brain text-3xl"></i>
            </div>
            <h4 className="font-semibold text-gray-900 dark:text-white leading-tight">AI-driven<br/>organization</h4>
          </div>
          <div className="flex flex-col items-center">
            <div className="mb-4 text-gray-400 dark:text-gray-500">
              <i className="fa-solid fa-shield-halved text-3xl"></i>
            </div>
            <h4 className="font-semibold text-gray-900 dark:text-white leading-tight">Secure &amp;<br/>private</h4>
          </div>
        </div>
      </section>
      {/* END: Features */}

      {/* BEGIN: FAQ Section */}
      <section className="py-20 max-w-3xl mx-auto px-6 w-full" id="faq-section">
        <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white text-center mb-12">
          Frequently Asked Questions
        </h2>

        <div className="divide-y-2 divide-gray-200 dark:divide-white/10">

          {/* FAQ 1 */}
          <div className="py-4">
            <button onClick={() => toggleFaq('faq-1')} className="flex justify-between items-center w-full text-left text-lg font-medium text-gray-900 dark:text-white py-2 focus:outline-none hover:text-primary dark:hover:text-primary transition-colors">
              <span>Are there any promotional offers or discounts available?</span>
              <i className={`fa-solid fa-chevron-down text-gray-400 dark:text-gray-500 transition-transform duration-200 ${activeFaq === 'faq-1' ? 'rotate-180' : ''}`}></i>
            </button>
            <div className={`pt-4 pb-2 prose dark:prose-invert max-w-none text-gray-500 dark:text-gray-400 ${activeFaq === 'faq-1' ? 'block' : 'hidden'}`}>
              <p>We occasionally run limited-time promotions, which you may receive via email or find in our community group. You can enter any valid promotion code directly at the Stripe checkout after selecting your desired plan.</p>
            </div>
          </div>

          {/* FAQ 2 */}
          <div className="py-4">
            <button onClick={() => toggleFaq('faq-2')} className="flex justify-between items-center w-full text-left text-lg font-medium text-gray-900 dark:text-white py-2 focus:outline-none hover:text-primary dark:hover:text-primary transition-colors">
              <span>What happens if I go over my storage limit?</span>
              <i className={`fa-solid fa-chevron-down text-gray-400 dark:text-gray-500 transition-transform duration-200 ${activeFaq === 'faq-2' ? 'rotate-180' : ''}`}></i>
            </button>
            <div className={`pt-4 pb-2 prose dark:prose-invert max-w-none text-gray-500 dark:text-gray-400 ${activeFaq === 'faq-2' ? 'block' : 'hidden'}`}>
              <p>We will never delete your files if you go slightly over your limit. We will notify you via email when you reach 90% and 100% of your storage quota. If you consistently remain over your limit, you will need to upgrade to the next plan or clear up some space.</p>
            </div>
          </div>

          {/* FAQ 3 */}
          <div className="py-4">
            <button onClick={() => toggleFaq('faq-3')} className="flex justify-between items-center w-full text-left text-lg font-medium text-gray-900 dark:text-white py-2 focus:outline-none hover:text-primary dark:hover:text-primary transition-colors">
              <span>Can I get a refund if I'm not happy?</span>
              <i className={`fa-solid fa-chevron-down text-gray-400 dark:text-gray-500 transition-transform duration-200 ${activeFaq === 'faq-3' ? 'rotate-180' : ''}`}></i>
            </button>
            <div className={`pt-4 pb-2 prose dark:prose-invert max-w-none text-gray-500 dark:text-gray-400 ${activeFaq === 'faq-3' ? 'block' : 'hidden'}`}>
              <p>Yes, we offer a 7-day, no-questions-asked money-back guarantee on all new paid subscriptions. If you're not satisfied, just contact support within your first week, and we will issue a full refund.</p>
            </div>
          </div>

          {/* FAQ 4 */}
          <div className="py-4">
            <button onClick={() => toggleFaq('faq-4')} className="flex justify-between items-center w-full text-left text-lg font-medium text-gray-900 dark:text-white py-2 focus:outline-none hover:text-primary dark:hover:text-primary transition-colors">
              <span>What file types are supported, and how do I export?</span>
              <i className={`fa-solid fa-chevron-down text-gray-400 dark:text-gray-500 transition-transform duration-200 ${activeFaq === 'faq-4' ? 'rotate-180' : ''}`}></i>
            </button>
            <div className={`pt-4 pb-2 prose dark:prose-invert max-w-none text-gray-500 dark:text-gray-400 ${activeFaq === 'faq-4' ? 'block' : 'hidden'}`}>
              <p>Sortana AI fully supports all major RAW formats (.CR2, .NEF, .ARW, .DNG, etc.), JPEG, PNG, and common video formats (.MP4, .MOV). You can download individual files or entire folders as a ZIP archive directly from the Organized Files view.</p>
            </div>
          </div>

        </div>
      </section>
      {/* END: FAQ Section */}
    </div>
  );
};

export default Pricing;
