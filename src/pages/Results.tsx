import axios from 'axios';
import React, { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Filter, ArrowRight, Star, Clock, Tag, ExternalLink, ChevronRight, Leaf, ShieldCheck, Zap, Plane, Train, Car, Hotel, Ticket, Compass, MapPin, ArrowUpDown, CreditCard, Info, User, AlertCircle, CheckCircle2, Loader2, X, Bus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SearchResult } from '../types';
import { auth, db } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { useTravel } from '../lib/TravelContext';
import BookingFlow from '../components/booking/BookingFlow';
import { parseFirestoreData } from '../lib/utils';
import TicketGenerator from '../components/tickets/TicketGenerator';

export default function Results() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { from, setFrom, to, setTo, date, setDate, time, setTime } = useTravel();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<string>('flight');
  const [bookingItem, setBookingItem] = useState<SearchResult | null>(null);
  const [bookingStatus, setBookingStatus] = useState<'idle' | 'confirming' | 'paying' | 'success' | 'passenger_info'>('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingId, setBookingId] = useState<string>('');
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showLoginError, setShowLoginError] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showRefundMessage, setShowRefundMessage] = useState(false);
  const [passengerInfo, setPassengerInfo] = useState({ name: '', age: '', phone: '', email: '' });
  const [showTicket, setShowTicket] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<any>(null);

  // Fallback mock data if API fails
  const mockFallback: SearchResult[] = [
    { id: 'm1', name: 'Premium Air', provider: 'Indigo', price: 4500, duration: '2h 15m', type: 'flight', rating: 4.8, image: 'https://picsum.photos/seed/flight/400/300' },
    { id: 'm2', name: 'Express Rail', provider: 'Shatabdi', price: 1200, duration: '3h 30m', type: 'train', rating: 4.5, image: 'https://picsum.photos/seed/train/400/300' },
    { id: 'm3', name: 'City Cab', provider: 'Uber', price: 800, duration: '4h 00m', type: 'cab', rating: 4.2, image: 'https://picsum.photos/seed/cab/400/300' },
    { id: 'm4', name: 'Grand Plaza', provider: 'Taj', price: 3500, duration: '1 Night', type: 'hotel', rating: 4.7, image: 'https://picsum.photos/seed/hotel/400/300' },
  ];

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      console.log('[Results] Fetching data for:', { from, to, activeType, time });
      try {
        const typeParam = `&type=${activeType}`;
        let endpoint = activeType === 'cab' ? '/api/cabs' : '/api/search';
        
        // Use Ticketmaster API for events
        if (activeType === 'event') {
          const eventsRes = await fetch(`/api/events?city=${encodeURIComponent(to || '')}`);
          const eventsData = await eventsRes.json();
          
          if (eventsData.events && eventsData.events.length > 0) {
            const mappedEvents = eventsData.events.map((ev: any, idx: number) => ({
              id: `ev-${idx}`,
              name: ev.name,
              provider: ev.venue,
              price: 0, // Ticketmaster doesn't always provide price in simple format
              duration: ev.time,
              type: 'event',
              rating: 4.9,
              image: ev.image,
              startTime: ev.time,
              startDate: ev.date,
              url: ev.url
            }));
            setResults(mappedEvents);
            setLoading(false);
            return;
          } else {
            setResults([]);
            setLoading(false);
            return;
          }
        }

        const res = await fetch(`${endpoint}?from=${encodeURIComponent(from || '')}&to=${encodeURIComponent(to || '')}${typeParam}&date=${date}&time=${time}`);
        
        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }
        
        const data = await res.json();
        console.log('[Results] API Response:', data);
        
        if (data.results && data.results.length > 0) {
          setResults(data.results);
        } else {
          console.warn('[Results] No results found, using fallback.');
          setResults(mockFallback.filter(item => item.type === activeType));
        }
      } catch (error) {
        console.error("[Results] Search failed, using fallback:", error);
        setResults(mockFallback.filter(item => item.type === activeType));
      } finally {
        setLoading(false);
      }
    };
    if (from && to) fetchResults();
    else setLoading(false);
  }, [from, to, activeType, date, time]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams({ from, to, date, time });
  };

  const swapLocations = () => {
    const temp = from;
    setFrom(to);
    setTo(temp);
  };

  const categories = [
    { id: 'flight', label: 'Flights', icon: Plane },
    { id: 'train', label: 'Trains', icon: Train },
    { id: 'cab', label: 'Cabs', icon: Car },
    { id: 'hotel', label: 'Hotels', icon: Hotel },
    { id: 'event', label: 'Events', icon: Compass },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-brand-primary/5"
    >
      {/* Booking Flow Modal */}
      {showBookingModal && bookingItem && (
        <BookingFlow 
          service={bookingItem.type as any}
          initialData={bookingItem}
          onComplete={(rawData) => {
            const booking = parseFirestoreData(rawData);
            setConfirmedBooking(booking);
            setShowBookingModal(false);
            setShowTicket(true);
          }}
          onCancel={() => setShowBookingModal(false)}
        />
      )}

      {/* Ticket Generator Modal */}
      {showTicket && confirmedBooking && (
        <TicketGenerator 
          booking={confirmedBooking}
          onClose={() => {
            setShowTicket(false);
            navigate('/profile');
          }}
        />
      )}

      {/* 1️⃣ Explore Section - Header with Gradient */}
      <div className="app-header-gradient pt-6 pb-24 px-6 rounded-b-[40px] relative overflow-hidden">
        {/* Decorative Circles */}
        <div className="absolute top-[-20px] right-[-20px] w-32 h-32 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute top-[40px] right-[20px] w-16 h-16 bg-rose-400/30 rounded-full blur-xl" />
        
        <div className="flex items-center gap-4 mb-4">
          <button className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center text-white">
            <ChevronRight className="rotate-180" size={16} />
          </button>
          <span className="text-white font-bold text-[10px] uppercase tracking-widest">Explore Travel</span>
        </div>

        <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl inline-flex items-center gap-2 mb-4">
          <MapPin size={12} className="text-amber-400" />
          <span className="text-white text-[10px] font-bold">{from || 'Mumbai'} Division</span>
        </div>

        <h1 className="text-3xl font-black text-white leading-tight mb-1">
          Explore<br />
          Local Travel
        </h1>
        <p className="text-white/70 text-[10px] font-medium max-w-[280px]">
          SmartRoute-curated options & local transport
        </p>
      </div>

      {/* Search Bar - Floating Card */}
      <div className="px-6 -mt-6 mb-8 relative z-10">
        <div className="bg-white p-5 rounded-[32px] shadow-xl shadow-brand-primary/10 border border-brand-primary/5">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center gap-3 p-3 bg-brand-primary/5 rounded-2xl border border-brand-primary/10">
                <MapPin size={16} className="text-brand-primary" />
                <input 
                  type="text" 
                  placeholder="From" 
                  className="bg-transparent border-none focus:ring-0 w-full text-xs font-bold p-0 text-brand-secondary"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3 p-3 bg-brand-primary/5 rounded-2xl border border-brand-primary/10">
                <Compass size={16} className="text-brand-secondary" />
                <input 
                  type="text" 
                  placeholder="To" 
                  className="bg-transparent border-none focus:ring-0 w-full text-xs font-bold p-0 text-brand-secondary"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-3 bg-brand-primary/5 rounded-2xl border border-brand-primary/10">
                  <Clock size={16} className="text-brand-primary/40" />
                  <input 
                    type="date" 
                    className="bg-transparent border-none focus:ring-0 w-full text-[10px] font-bold p-0 text-brand-secondary"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-3 p-3 bg-brand-primary/5 rounded-2xl border border-brand-primary/10">
                  <Clock size={16} className="text-brand-primary/40" />
                  <input 
                    type="time" 
                    className="bg-transparent border-none focus:ring-0 w-full text-[10px] font-bold p-0 text-brand-secondary"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={swapLocations}
                className="w-12 h-12 bg-brand-primary/5 rounded-2xl flex items-center justify-center text-brand-primary hover:bg-brand-primary/10 transition-all"
              >
                <ArrowUpDown size={18} />
              </button>
              <button className="flex-1 bg-brand-secondary text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-brand-primary transition-all">
                Search Options
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Categories - Closer Together */}
      <div className="px-6 mb-8">
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveType(cat.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl transition-all shrink-0 ${
                activeType === cat.id 
                  ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' 
                  : 'bg-white border border-brand-primary/10 text-brand-primary/40'
              }`}
            >
              <cat.icon size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Results Feed - Cards matching the image style */}
      <div className="px-6 pb-32">
        {!from || !to ? (
          <div className="space-y-8">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-brand-secondary uppercase tracking-widest">Featured Destinations</h3>
                <button className="text-[10px] font-black text-brand-primary uppercase tracking-widest">View All</button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                {[
                  { name: 'Lonavala', image: 'https://picsum.photos/seed/lonavala/400/300', price: '₹1,200', type: 'Hill Station' },
                  { name: 'Mahabaleshwar', image: 'https://picsum.photos/seed/mahabaleshwar/400/300', price: '₹2,500', type: 'Nature' },
                  { name: 'Alibaug', image: 'https://picsum.photos/seed/alibaug/400/300', price: '₹1,800', type: 'Beach' },
                ].map((dest, i) => (
                  <div key={i} className="min-w-[200px] bg-white rounded-[24px] overflow-hidden border border-brand-primary/5 shadow-sm">
                    <img src={dest.image} alt={dest.name} className="w-full h-24 object-cover" referrerPolicy="no-referrer" />
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[8px] font-black text-brand-primary uppercase tracking-widest">{dest.type}</span>
                        <span className="text-[10px] font-black text-brand-secondary">{dest.price}</span>
                      </div>
                      <h4 className="text-xs font-black text-brand-secondary">{dest.name}</h4>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-black text-brand-secondary uppercase tracking-widest mb-4">Trending Now</h3>
              <div className="space-y-4">
                {[
                  { title: 'Monsoon Treks', desc: 'Explore the Sahyadris', icon: Compass, color: 'bg-emerald-50 text-emerald-600' },
                  { title: 'Luxury Stays', desc: 'Top rated villas near you', icon: Hotel, color: 'bg-amber-50 text-amber-600' },
                  { title: 'Quick Getaways', desc: 'Perfect for the weekend', icon: Zap, color: 'bg-rose-50 text-rose-600' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 bg-white rounded-[24px] border border-brand-primary/5 shadow-sm">
                    <div className={`w-12 h-12 ${item.color} rounded-2xl flex items-center justify-center`}>
                      <item.icon size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-brand-secondary">{item.title}</h4>
                      <p className="text-[10px] font-bold text-brand-primary/40">{item.desc}</p>
                    </div>
                    <ChevronRight size={16} className="ml-auto text-brand-primary/20" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-white rounded-[32px] animate-pulse border border-brand-primary/10" />
            ))}
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-6">
            {results.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white p-6 rounded-[32px] border border-brand-primary/10 shadow-sm relative group min-w-0 overflow-hidden box-border">
                      <div className="flex items-center gap-4 mb-6 min-w-0">
                  <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center shrink-0">
                    {item.type === 'flight' ? <Plane size={24} /> : 
                     item.type === 'train' ? <Train size={24} /> :
                     item.type === 'cab' ? <Car size={24} /> : <Hotel size={24} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-black text-brand-secondary leading-tight truncate">
                      {item.name || item.provider}
                    </h3>
                    <p className="text-[10px] font-bold text-brand-primary/40 uppercase tracking-widest truncate">
                      Powered by SmartRoute
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Star size={12} className="text-amber-400" fill="currentColor" />
                    <span className="text-xs font-black text-brand-secondary">{item.rating}</span>
                  </div>
                </div>

                  <div className="space-y-3 mb-6">
                    <div className="grid grid-cols-2 gap-4 p-3 bg-brand-primary/5 rounded-2xl border border-brand-primary/10">
                      {item.type === 'hotel' ? (
                        <>
                          <div>
                            <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">Start Time</p>
                            <p className="text-xs font-black text-brand-secondary">{item.entryTime || item.startTime}</p>
                            <p className="text-[8px] font-bold text-brand-primary/40">{item.startDate}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">End Time</p>
                            <p className="text-xs font-black text-brand-secondary">{item.exitTime || item.endTime}</p>
                            <p className="text-[8px] font-bold text-brand-primary/40">{item.endDate}</p>
                          </div>
                        </>
                      ) : (item.type === 'restaurant' || item.type === 'event') ? (
                        <>
                          <div>
                            <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">Start Time</p>
                            <p className="text-xs font-black text-brand-secondary">{item.bookingDate || item.startDate}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">End Time</p>
                            <p className="text-xs font-black text-brand-secondary">{item.timeSlot || item.startTime}</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">Departure</p>
                            <p className="text-xs font-black text-brand-secondary">{item.startTime}</p>
                            <p className="text-[8px] font-bold text-brand-primary/40">{item.startDate}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">Arrival</p>
                            <p className="text-xs font-black text-brand-secondary">{item.endTime}</p>
                            <p className="text-[8px] font-bold text-brand-primary/40">{item.endDate}</p>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <span className="text-xs">📝</span>
                      <p className="text-xs text-brand-primary/60 leading-relaxed">
                        <span className="font-black text-brand-secondary">About:</span> {item.type === 'hotel' ? `A luxury stay in the heart of the city.` : 
                                                                            item.type === 'restaurant' ? `Exquisite dining experience with local flavors.` :
                                                                            item.type === 'event' ? `An unforgettable experience you don't want to miss.` :
                                                                            `A premium ${item.type} service from ${from} to ${to}, ensuring comfort and timely arrival.`}
                      </p>
                    </div>
                    
                    {item.distanceFromCenter && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs">📍</span>
                        <p className="text-xs text-brand-primary/60">
                          <span className="font-black text-brand-secondary">Distance:</span> {item.distanceFromCenter} from city center
                        </p>
                      </div>
                    )}

                    {item.popularity && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs">🔥</span>
                        <p className="text-xs text-brand-primary/60">
                          <span className="font-black text-brand-secondary">Popularity:</span> {item.popularity}% match for you
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <span className="text-xs">🕒</span>
                      <p className="text-xs text-brand-primary/60">
                        <span className="font-black text-brand-secondary">Duration:</span> {item.duration}
                      </p>
                    </div>
                  </div>

                <div className="flex items-center justify-between pt-4 border-t border-brand-primary/5">
                  <div className="text-left">
                    <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-0.5">Starting from</p>
                    <p className="text-lg font-black text-brand-secondary">₹{(item.price || 0).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2">
                    {item.url && item.url !== '#' && (
                      <a 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-4 py-3 bg-brand-secondary/10 text-brand-secondary text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-brand-secondary/20 transition-all flex items-center gap-2"
                      >
                        <ExternalLink size={14} />
                        Visit
                      </a>
                    )}
                    <button 
                      onClick={() => {
                        if (!auth.currentUser) {
                          setShowLoginError(true);
                          return;
                        }
                        setBookingItem(item);
                        setShowBookingModal(true);
                      }}
                      className="px-6 py-3 bg-brand-primary text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-brand-secondary transition-all shadow-lg active:scale-95"
                    >
                      Book Now
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-brand-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Compass size={32} className="text-brand-primary/20" />
            </div>
            <h3 className="text-lg font-black text-brand-secondary mb-2">No options found</h3>
            <p className="text-xs text-brand-primary/40 font-black uppercase tracking-widest">Try adjusting your search</p>
          </div>
        )}
      </div>

      {/* Booking Flow Modal */}
      {showBookingModal && bookingItem && (
        <BookingFlow
          service={bookingItem.type as any}
          initialData={bookingItem}
          onCancel={() => setShowBookingModal(false)}
          onComplete={(rawData) => {
            const booking = parseFirestoreData(rawData);
            setConfirmedBooking(booking);
            setShowBookingModal(false);
            setShowTicket(true);
          }}
        />
      )}

      {/* Ticket Generator Modal */}
      {showTicket && confirmedBooking && (
        <TicketGenerator
          booking={confirmedBooking}
          onClose={() => setShowTicket(false)}
        />
      )}

      {/* Login Required Modal */}
      <AnimatePresence>
        {showLoginError && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-brand-secondary/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle size={32} />
              </div>
              <h2 className="text-2xl font-black text-brand-secondary mb-2 text-center">Login Required</h2>
              <p className="text-brand-primary/60 mb-8 text-sm text-center">
                user information should be entered first by clicking on user info
              </p>
              <button 
                onClick={() => setShowLoginError(false)}
                className="w-full py-4 bg-brand-primary text-white font-black text-[10px] uppercase tracking-widest rounded-2xl"
              >
                Got it
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

