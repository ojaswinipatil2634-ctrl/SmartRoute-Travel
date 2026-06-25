import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, X, Bot, User, Loader2, ChevronUp, ChevronDown, Sparkles, Navigation, Clock, Zap, Plane, Train, Car, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { chatWithAssistant } from '../services/aiService';
import { auth, db } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { useTravel } from '../lib/TravelContext';
import { generateJourneyBreakdown, JourneyOption } from '../lib/mistral';
import JourneyMap from './JourneyMap';
import DestinationGallery from './DestinationGallery';
import { SearchResult } from '../types';

export default function AIChat() {
  const { from, to, time, selectedProviders } = useTravel();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, "chat_history"),
      where("userId", "==", auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a: any, b: any) => {
        const timeA = a.timestamp?.toMillis?.() || a.timestamp?.seconds * 1000 || 0;
        const timeB = b.timestamp?.toMillis?.() || b.timestamp?.seconds * 1000 || 0;
        return timeA - timeB;
      });
      setMessages(msgs);
    }, (error: any) => {
      console.error('Firestore Error:', error);
      if (error.message?.includes('requires an index')) {
        console.warn("Chat history requires an index. Please check Firebase Console.");
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !auth.currentUser) return;

    const userMsg = message;
    setMessage('');
    setLoading(true);

    try {
      await chatWithAssistant(userMsg, auth.currentUser.uid, messages);
    } catch (error) {
      console.error("Chat failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-brand-primary/5">
      {/* Header */}
      <div className="app-header-gradient pt-8 pb-6 px-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white shadow-xl">
            <Sparkles size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white leading-none">Travel Assistant</h1>
            <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-1">AI Powered Planning</p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto shadow-sm border border-slate-100">
              <Bot size={32} className="text-brand-primary" />
            </div>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest leading-relaxed">
              I can help with<br/>route suggestions, and more!
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[75%] p-4 rounded-3xl text-xs font-medium leading-relaxed shadow-sm ${
              msg.role === 'user' 
                ? 'bg-brand-primary text-white rounded-tr-none self-end' 
                : 'bg-white text-brand-secondary rounded-tl-none border border-slate-100 self-start'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white p-4 rounded-3xl rounded-tl-none shadow-sm border border-slate-100">
              <Loader2 size={16} className="animate-spin text-brand-primary" />
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-6 bg-white border-t border-slate-100 shrink-0">
        {!auth.currentUser ? (
          <div className="text-center py-2">
            <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest">
              user information should be entered first by clicking on user info
            </p>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex gap-3">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="ask AI anything about travelling"
              className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-xs font-bold focus:ring-2 focus:ring-brand-primary focus:bg-white transition-all placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={!message.trim() || loading}
              className="w-14 h-14 bg-brand-primary text-white rounded-2xl flex items-center justify-center disabled:opacity-50 transition-all shadow-lg shadow-indigo-100 active:scale-95"
            >
              <Send size={20} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
