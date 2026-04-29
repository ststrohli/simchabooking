import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, X, Loader2, MessageSquare, Bot } from 'lucide-react';
import { getPlanningAdvice } from './geminiService';

/**
 * AIPlanner component: A floating interactive interface for getting AI-driven planning advice.
 */
export default function AIPlanner() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleAskAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setResponse(null);
    
    try {
      const advice = await getPlanningAdvice(query);
      setResponse(advice);
    } catch (err) {
      setResponse("I'm sorry, I'm having a bit of trouble connecting to my planning database. Please try again in a moment.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [response, isLoading]);

  return (
    <>
      {/* Floating Action Button */}
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-24 z-[45] bg-[#D4AF37] text-black p-4 rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center gap-2 font-bold border-2 border-black"
      >
        <Sparkles className="w-5 h-5" />
        <span className="hidden md:inline">Planning AI</span>
      </button>

      {/* AI Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-end p-4 md:p-8 pointer-events-none">
          <div className="w-full max-w-md bg-[#0a0a0a] border border-[#D4AF37]/30 rounded-2xl shadow-2xl flex flex-col pointer-events-auto animate-in slide-in-from-bottom-5 duration-300 max-h-[85vh]">
            {/* Header */}
            <div className="p-4 border-b border-[#D4AF37]/20 flex justify-between items-center bg-black rounded-t-2xl">
              <div className="flex items-center gap-2">
                <div className="bg-[#D4AF37]/10 p-2 rounded-lg">
                  <Bot className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <div>
                  <h3 className="font-bold font-[Cinzel] text-[#D4AF37] text-sm">Simcha AI Advisor</h3>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">Powered by Gemini 3</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-slate-500 hover:text-white p-2 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Area */}
            <div ref={contentRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {!response && !isLoading && (
                <div className="text-center py-10 opacity-50">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 text-[#D4AF37]/20" />
                  <p className="text-sm text-slate-400">Ask me anything about your upcoming event, from Kosher catering tips to traditional ceremony timelines.</p>
                </div>
              )}

              {isLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
                  <p className="text-xs text-[#D4AF37]/60 font-bold uppercase tracking-tighter">Consulting traditions...</p>
                </div>
              )}

              {response && (
                <div className="bg-[#111] p-5 rounded-2xl border border-[#D4AF37]/10 animate-in fade-in zoom-in-95 duration-500">
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{response}</p>
                </div>
              )}
            </div>

            {/* Footer Input */}
            <form onSubmit={handleAskAI} className="p-4 bg-black border-t border-[#D4AF37]/20 rounded-b-2xl">
              <div className="relative flex items-center">
                <input 
                  type="text" 
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask for advice..."
                  className="w-full bg-[#111] border border-[#D4AF37]/20 rounded-xl pl-4 pr-12 py-3 text-sm text-white focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all"
                />
                <button 
                  type="submit" 
                  disabled={isLoading || !query.trim()}
                  className="absolute right-2 p-2 bg-[#D4AF37] text-black rounded-lg disabled:opacity-30 hover:bg-[#E5C76B] transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
