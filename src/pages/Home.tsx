import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Calendar, Users, Plane, Train, Car, Hotel, Utensils, Ticket, ChevronRight, Compass, User, ArrowRight, ArrowUpDown, Clock, Zap, Star, Leaf, Tag, ShieldCheck, Info, Loader2, AlertCircle, CheckCircle2, X, CreditCard, Sparkles, Navigation, Bus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { useTravel } from '../lib/TravelContext';
import { SearchResult } from '../types';
import axios from 'axios';
import { generateJourneyBreakdown, JourneyOption, SelectedProviders, getMockSmartJourneys } from '../lib/mistral';
import JourneyMap from '../components/JourneyMap';
import PlaceImage from '../components/PlaceImage';
import DestinationGallery from '../components/DestinationGallery';
import { sanitizeFirestoreData } from '../lib/utils';

export default function Home() {
  const navigate = useNavigate();
  const { from, setFrom, to, setTo, date, setDate, time, setTime, selectedProviders, setSelectedProviders } = useTravel();
  const [user, setUser] = useState(auth.currentUser);
  
  // Results & Booking State
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeType, setActiveType] = useState<string>('flight');
  const [bookingItem, setBookingItem] = useState<SearchResult | null>(null);
  const [bookingStatus, setBookingStatus] = useState<'idle' | 'passenger_info' | 'paying' | 'success'>('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingId, setBookingId] = useState<string>('');
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showLoginError, setShowLoginError] = useState(false);
  const [passengerInfo, setPassengerInfo] = useState({ name: '', age: '', phone: '', email: '' });

  // Smart Journey State
  const [smartJourneys, setSmartJourneys] = useState<JourneyOption[]>([]);
  const [selectedSmartJourney, setSelectedSmartJourney] = useState<JourneyOption | null>(null);
  const [isGeneratingSmart, setIsGeneratingSmart] = useState(false);
  const [showSmartSection, setShowSmartSection] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);

  // Fallback mock data if API fails
  const mockFallback: SearchResult[] = [
    { id: 'm1', name: 'Premium Air', provider: 'Indigo', price: 4500, duration: '2h 15m', type: 'flight', rating: 4.8, image: 'https://picsum.photos/seed/flight/400/300' },
    { id: 'm2', name: 'Express Rail', provider: 'Shatabdi', price: 1200, duration: '3h 30m', type: 'train', rating: 4.5, image: 'https://picsum.photos/seed/train/400/300' },
    { id: 'm3', name: 'City Cab', provider: 'Uber', price: 800, duration: '4h 00m', type: 'cab', rating: 4.2, image: 'https://picsum.photos/seed/cab/400/300' },
    { id: 'm4', name: 'Grand Plaza', provider: 'Taj', price: 3500, duration: '1 Night', type: 'hotel', rating: 4.7, image: 'https://picsum.photos/seed/hotel/400/300' },
  ];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  const fetchResults = async () => {
    if (!to) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const typeParam = `&type=${activeType}`;
      const endpoint = activeType === 'cab' ? '/api/cabs' : '/api/search';
      const res = await fetch(`${endpoint}?from=${encodeURIComponent(from || '')}&to=${encodeURIComponent(to || '')}${typeParam}&date=${date}&time=${time}`);
      
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        setResults(data.results);
      } else {
        setResults(mockFallback.filter(item => item.type === activeType));
      }
    } catch (error) {
      console.error("Search failed:", error);
      setResults(mockFallback.filter(item => item.type === activeType));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasSearched) fetchResults();
  }, [activeType]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Normalize inputs to prevent errors like "gateway of india,,delhi"
    const cleanFrom = from.replace(/,+/g, ',').replace(/\s+/g, ' ').trim();
    const cleanTo = to.replace(/,+/g, ',').replace(/\s+/g, ' ').trim();
    
    setFrom(cleanFrom);
    setTo(cleanTo);
    
    // We can't rely on state being updated immediately, so we could pass them or just let the useEffect handle it if we triggered it.
    // However, fetchResults and handleSmartSearch are called manually here.
    
    setHasSearched(true);
    setLoading(true);
    
    // Trigger search with cleaned values
    const triggerSearch = async () => {
      try {
        const typeParam = `&type=${activeType}`;
        const endpoint = activeType === 'cab' ? '/api/cabs' : '/api/search';
        const res = await fetch(`${endpoint}?from=${encodeURIComponent(cleanFrom)}&to=${encodeURIComponent(cleanTo)}${typeParam}&date=${date}&time=${time}`);
        
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          setResults(data.results);
        } else {
          setResults(mockFallback.filter(item => item.type === activeType));
        }
      } catch (error) {
        console.error("Search failed:", error);
        setResults(mockFallback.filter(item => item.type === activeType));
      } finally {
        setLoading(false);
      }

      if (cleanFrom && cleanTo) {
        setIsGeneratingSmart(true);
        setShowSmartSection(true);
        setSmartError(null);
        try {
          const journeys = await generateJourneyBreakdown(cleanFrom, cleanTo, time || '09:00', selectedProviders);
          setSmartJourneys(journeys);
          if (journeys.length > 0) {
            setSelectedSmartJourney(journeys.find(j => j.isSmartest) || journeys[0]);
          }
        } catch (error: any) {
          console.error("Smart Journey generation failed:", error);
          setSmartError("Could not generate smart breakdown. Using fallback.");
          const fallbackJourneys = getMockSmartJourneys(cleanFrom, cleanTo, selectedProviders);
          setSmartJourneys(fallbackJourneys);
          setSelectedSmartJourney(fallbackJourneys[0]);
        } finally {
          setIsGeneratingSmart(false);
        }
      }
    };

    triggerSearch();
  };

  const handleSmartSearch = async () => {
    if (!from || !to) return;
    setIsGeneratingSmart(true);
    setShowSmartSection(true);
    setSmartError(null);
    try {
      const journeys = await generateJourneyBreakdown(from, to, time || '09:00', selectedProviders);
      setSmartJourneys(journeys);
      if (journeys.length > 0) {
        setSelectedSmartJourney(journeys.find(j => j.isSmartest) || journeys[0]);
      }
    } catch (error: any) {
      const errorStr = JSON.stringify(error);
      const isQuotaError = errorStr.includes('429') || 
                          errorStr.includes('RESOURCE_EXHAUSTED') || 
                          error.message?.includes('429') || 
                          error.status === 'RESOURCE_EXHAUSTED';

      if (isQuotaError) {
        console.warn("Mistral Quota Exceeded, falling back to mock data.");
        setSmartError("Mistral Quota Exceeded. Using optimized fallback routes.");
        const fallbackJourneys = getMockSmartJourneys(from, to, selectedProviders);
        setSmartJourneys(fallbackJourneys);
        setSelectedSmartJourney(fallbackJourneys[0]);
      } else {
        console.error("Smart Journey generation failed:", error);
        setSmartError("Could not generate smart breakdown. Please try again.");
      }
    } finally {
      setIsGeneratingSmart(false);
    }
  };

  useEffect(() => {
    if (hasSearched && (from && to)) {
      handleSmartSearch();
    }
  }, [selectedProviders]);

  const swapLocations = () => {
    const temp = from;
    setFrom(to);
    setTo(temp);
  };

  const handleBook = async () => {
    if (!bookingItem) return;
    if (!auth.currentUser) {
      alert("user information should be entered first by clicking on user info");
      return;
    }
    setBookingStatus('passenger_info');
  };

  const useGoogleInfo = () => {
    if (auth.currentUser) {
      setPassengerInfo({
        ...passengerInfo,
        name: auth.currentUser.displayName || '',
        email: auth.currentUser.email || '',
      });
    }
  };

  const handleConfirmPassenger = () => {
    if (!passengerInfo.name || !passengerInfo.age || !passengerInfo.phone || !passengerInfo.email) {
      alert("Please fill in all passenger details.");
      return;
    }
    setBookingStatus('paying');
  };

  const [emailError, setEmailError] = useState<string | null>(null);

  const handlePay = async () => {
    if (!bookingItem || !auth.currentUser || isProcessing) return;
    setIsProcessing(true);
    setEmailError(null);
    
    const newBookingId = "BK" + Math.random().toString(36).substr(2, 9).toUpperCase();
    setBookingId(newBookingId);

    try {
      const ticketRef = collection(db, 'tickets');
      const rawTicketData = {
        bookingId: newBookingId,
        bookingType: bookingItem.type,
        userId: auth.currentUser.uid, // Keep for querying
        user: {
          uid: auth.currentUser.uid,
          displayName: passengerInfo.name || 'Guest',
          email: passengerInfo.email || '',
          phone: passengerInfo.phone || ''
        },
        passengerName: passengerInfo.name,
        email: passengerInfo.email,
        phone: passengerInfo.phone,
        age: passengerInfo.age,
        source: from || 'Unknown',
        destination: to || 'Unknown',
        dateTime: bookingItem.startTime || new Date().toLocaleString(),
        arrivalTime: bookingItem.endTime || '--:--',
        price: bookingItem.price,
        service: bookingItem.name || bookingItem.provider,
        type: bookingItem.type,
        status: 'confirmed',
        createdAt: new Date().toISOString(), // Using ISO string for consistency
        details: {
          from: from || 'Unknown',
          to: to || 'Unknown',
          date: date || new Date().toISOString().split('T')[0],
          price: bookingItem.price,
          service: bookingItem.type,
          provider: bookingItem.provider || bookingItem.name
        }
      };

      // Production-ready sanitization
      const ticketData = sanitizeFirestoreData(rawTicketData);

      await addDoc(ticketRef, ticketData);

      try {
        const response = await axios.post('/api/send-ticket', {
          email: passengerInfo.email,
          bookingId: newBookingId,
          passengerName: passengerInfo.name,
          details: {
            from: from || 'Unknown',
            to: to || 'Unknown',
            price: bookingItem.price,
            service: bookingItem.name || bookingItem.provider,
            time: `${bookingItem.startTime} - ${bookingItem.endTime || '--:--'}`
          }
        });
        
        if (response.data.warning) {
          setEmailError(response.data.message);
        }
      } catch (e: any) {
        console.warn("Email sending failed, but booking was saved.", e);
        if (e.response?.data?.message) {
          setEmailError(e.response.data.message);
        } else {
          setEmailError("Failed to send confirmation email. Please check your SendGrid configuration.");
        }
      }
      
      setBookingStatus('success');
    } catch (error) {
      console.error("Booking failed", error);
      setBookingStatus('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSuccessDone = () => {
    setShowBookingModal(false);
    setBookingStatus('idle');
    setShowSuccessMessage(true);
  };

  const categories = [
    { id: 'flight', label: 'Flights', icon: Plane },
    { id: 'train', label: 'Trains', icon: Train },
    { id: 'cab', label: 'Cabs', icon: Car },
    { id: 'hotel', label: 'Hotels', icon: Hotel },
    { id: 'event', label: 'Events', icon: Compass },
  ];

  const travelOptions = [
    { type: 'Flight', icon: Plane, price: '₹4,200', duration: '2h 15m', time: '10:30 AM', color: 'text-brand-primary', bg: 'bg-brand-primary/5' },
    { type: 'Train', icon: Train, price: '₹1,150', duration: '6h 45m', time: '08:00 AM', color: 'text-brand-secondary', bg: 'bg-brand-secondary/5' },
    { type: 'Event', icon: Compass, price: 'From ₹499', duration: '3h 00m', time: 'Evening', color: 'text-amber-500', bg: 'bg-amber-50' },
    { type: 'Cab', icon: Car, price: '₹2,800', duration: '4h 30m', time: 'Anytime', color: 'text-brand-primary', bg: 'bg-brand-primary/10' },
  ];

  const isSearchEmpty = !from && !to;
  const showDiscovery = !hasSearched && (!user || isSearchEmpty);

  return (
    <div className="flex flex-col min-h-screen bg-brand-primary/5">
      {/* Explore Section - Header with Gradient (Restored) */}
      <div className="app-header-gradient pt-6 pb-24 px-6 rounded-b-[40px] relative overflow-hidden">
        <div className="absolute top-[-20px] right-[-20px] w-32 h-32 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute top-[40px] right-[20px] w-16 h-16 bg-rose-400/30 rounded-full blur-xl" />
        
        <div className="flex items-center gap-4 mb-4">
          <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl inline-flex items-center gap-2">
            <MapPin size={12} className="text-amber-400" />
            <span className="text-white text-[10px] font-bold">{from || 'Mumbai'} Division</span>
          </div>
        </div>

        <h1 className="text-3xl font-black text-white leading-tight mb-1">
          Explore<br />
          Local Travel
        </h1>
        <p className="text-white/70 text-[10px] font-medium max-w-[280px]">
          SmartRoute-curated options & local transport
        </p>
      </div>

      {/* Search Bar - Moved to top below header */}
      <div className="px-6 -mt-8 mb-8 relative z-20">
        <div className="bg-white p-5 rounded-[32px] shadow-xl shadow-brand-primary/10 border border-brand-primary/5">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center gap-3 p-3 bg-brand-primary/5 rounded-2xl border border-brand-primary/10">
                <MapPin size={16} className="text-brand-primary" />
                <input 
                  type="text" 
                  placeholder="From" 
                  className="bg-transparent border-none focus:outline-none w-full text-xs font-bold p-0 text-brand-secondary"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setShowSmartSection(false);
                  }}
                />
              </div>
              <div className="flex items-center gap-3 p-3 bg-brand-primary/5 rounded-2xl border border-brand-primary/10">
                <Compass size={16} className="text-brand-secondary" />
                <input 
                  type="text" 
                  placeholder="To" 
                  className="bg-transparent border-none focus:outline-none w-full text-xs font-bold p-0 text-brand-secondary"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setShowSmartSection(false);
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-3 bg-brand-primary/5 rounded-2xl border border-brand-primary/10">
                  <Calendar size={16} className="text-brand-primary/40" />
                  <input 
                    type="date" 
                    className="bg-transparent border-none focus:outline-none w-full text-[10px] font-bold p-0 text-brand-secondary"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setShowSmartSection(false);
                    }}
                  />
                </div>
                <div className="flex items-center gap-3 p-3 bg-brand-primary/5 rounded-2xl border border-brand-primary/10">
                  <Clock size={16} className="text-brand-primary/40" />
                  <input 
                    type="time" 
                    className="bg-transparent border-none focus:outline-none w-full text-[10px] font-bold p-0 text-brand-secondary"
                    value={time}
                    onChange={(e) => {
                      setTime(e.target.value);
                      setShowSmartSection(false);
                    }}
                  />
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button className="flex-1 bg-brand-secondary text-white rounded-2xl h-12 text-xs font-black uppercase tracking-widest hover:bg-brand-primary transition-all shadow-lg shadow-brand-secondary/20 flex items-center justify-center gap-2">
                Search
              </button>
            </div>
          </form>

          {/* Travel Options Cards */}
          <div className="mt-6">
            <h2 className="text-[9px] font-black text-brand-primary/40 uppercase tracking-widest mb-3">Quick Options</h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
              {travelOptions.map((opt, i) => (
                <motion.div
                  key={opt.type}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setActiveType(opt.type.toLowerCase());
                    fetchResults();
                  }}
                  className="bg-white border border-brand-primary/5 rounded-2xl p-3 min-w-[140px] shadow-sm flex flex-col gap-2 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className={`w-8 h-8 ${opt.bg} ${opt.color} rounded-xl flex items-center justify-center`}>
                      <opt.icon size={16} />
                    </div>
                    <span className="text-[10px] font-black text-brand-secondary">{opt.price}</span>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-brand-secondary uppercase tracking-widest">{opt.type}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex items-center gap-1 text-[8px] font-bold text-brand-primary/40">
                        <Clock size={8} />
                        <span>{opt.duration}</span>
                      </div>
                      <span className="text-[8px] font-bold text-brand-primary/40">•</span>
                      <span className="text-[8px] font-bold text-brand-primary/40">{opt.time}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {hasSearched ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Categories */}
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

          {/* Results Feed */}
          <div className="px-6 pb-32">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-48 bg-white rounded-[32px] animate-pulse border border-brand-primary/10" />
                ))}
              </div>
            ) : results.length > 0 ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-black text-brand-secondary uppercase tracking-widest">Compare Providers</h2>
                  <div className="flex gap-2">
                    {Object.entries(selectedProviders).map(([mode, provider]) => provider && (
                      <div key={mode} className="px-2 py-1 bg-brand-primary/10 rounded-lg flex items-center gap-1 border border-brand-primary/20">
                        <span className="text-[8px] font-black text-brand-primary uppercase">{mode}: {provider}</span>
                        <button onClick={() => setSelectedProviders(prev => ({ ...prev, [mode]: null }))} className="text-brand-primary hover:text-brand-secondary">
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
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
                        <div>
                          <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">
                            {item.type === 'hotel' ? 'Start Date' : (item.type === 'event' ? 'Start Time' : 'Departure')}
                          </p>
                          <p className="text-xs font-black text-brand-secondary">{item.startTime || '--:--'}</p>
                          <p className="text-[8px] font-bold text-brand-primary/40">{item.startDate || date}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">
                            {item.type === 'hotel' ? 'End Date' : (item.type === 'event' ? 'End Time' : 'Arrival')}
                          </p>
                          <p className="text-xs font-black text-brand-secondary">{item.endTime || '--:--'}</p>
                          <p className="text-[8px] font-bold text-brand-primary/40">{item.endDate || date}</p>
                        </div>
                      </div>
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
                        <p className="text-lg font-black text-brand-secondary">₹{item.price?.toLocaleString() || '0'}</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            if (!auth.currentUser) {
                              setShowLoginError(true);
                              return;
                            }
                            setBookingItem(item);
                            setShowBookingModal(true);
                          }}
                          className="px-6 py-3 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all border bg-brand-secondary text-white border-brand-secondary shadow-lg hover:bg-brand-secondary/90"
                        >
                          Book
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
        </div>
      ) : null}

      {showDiscovery ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Famous Places in India */}
          <div className="px-5 py-6 bg-brand-primary/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] font-black text-brand-primary/40 uppercase tracking-widest">Famous Places in India</h2>
            </div>
            <div className="space-y-3">
              {[
                { name: 'Taj Mahal', location: 'Agra', price: 'Entry: ₹50' },
                { name: 'Hawa Mahal', location: 'Jaipur', price: 'Entry: ₹200' },
                { name: 'Gateway of India', location: 'Mumbai', price: 'Free Entry' },
                { name: 'Red Fort', location: 'Delhi', price: 'Entry: ₹35' },
              ].map((place, i) => (
                <motion.div
                  key={i}
                  whileTap={{ scale: 0.99 }}
                  className="bg-white rounded-2xl border border-brand-primary/10 shadow-sm overflow-hidden flex h-24"
                >
                  <div className="w-32 h-full">
                    <PlaceImage placeName={place.name} className="w-full h-full" />
                  </div>
                  <div className="flex-1 p-3 flex flex-col justify-center">
                    <h3 className="font-black text-brand-secondary text-[11px]">{place.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[8px] font-black text-brand-primary uppercase tracking-widest bg-brand-primary/10 px-1.5 py-0.5 rounded">{place.price}</span>
                      <span className="text-[8px] font-bold text-brand-primary/40 uppercase tracking-widest">{place.location}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Famous Hotels in India */}
          <div className="px-5 py-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] font-black text-brand-primary/40 uppercase tracking-widest">Famous Hotels</h2>
            </div>
            <div className="space-y-3">
              {[
                { name: 'Taj Lake Palace', location: 'Udaipur', price: '₹45k/night' },
                { name: 'The Oberoi Amarvilas', location: 'Agra', price: '₹38k/night' },
                { name: 'Rambagh Palace', location: 'Jaipur', price: '₹52k/night' },
              ].map((hotel, i) => (
                <motion.div
                  key={i}
                  whileTap={{ scale: 0.99 }}
                  className="bg-white rounded-2xl border border-brand-primary/10 shadow-sm overflow-hidden flex h-24"
                >
                  <div className="w-32 h-full">
                    <PlaceImage placeName={hotel.name} className="w-full h-full" />
                  </div>
                  <div className="flex-1 p-3 flex flex-col justify-center">
                    <h3 className="font-black text-brand-secondary text-[11px]">{hotel.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[8px] font-black text-brand-secondary uppercase tracking-widest bg-brand-secondary/10 px-1.5 py-0.5 rounded">{hotel.price}</span>
                      <span className="text-[8px] font-bold text-brand-primary/40 uppercase tracking-widest">{hotel.location}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="pb-32"></div>

      {/* Booking Modal */}
      <AnimatePresence>
        {showBookingModal && bookingItem && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-brand-secondary/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar relative"
            >
              <button 
                onClick={() => setShowBookingModal(false)}
                className="absolute top-6 right-6 w-10 h-10 bg-brand-primary/5 text-brand-primary/40 rounded-full flex items-center justify-center hover:bg-brand-primary/10 transition-colors z-10"
              >
                <X size={20} />
              </button>

              {bookingStatus === 'idle' && (
                <>
                  <h2 className="text-2xl font-black text-brand-secondary mb-2">Confirm Booking</h2>
                  <p className="text-brand-primary/60 mb-6 text-sm">Review your travel details before proceeding to passenger information.</p>
                  
                  <div className="bg-brand-primary/5 p-6 rounded-3xl mb-8 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-brand-primary/60 text-xs font-bold">Service</span>
                      <span className="font-black text-brand-secondary capitalize text-xs">{bookingItem.name || bookingItem.provider}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-brand-primary/60 text-xs font-bold">Type</span>
                      <span className="font-black text-brand-secondary capitalize text-xs">{bookingItem.type}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 py-2">
                      <div>
                        <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">
                          {bookingItem.type === 'hotel' ? 'Start Date' : (bookingItem.type === 'event' ? 'Start Time' : 'Departure')}
                        </p>
                        <p className="text-[10px] font-black text-brand-secondary">{bookingItem.startTime || '--:--'}</p>
                        <p className="text-[8px] font-bold text-brand-primary/60">{bookingItem.startDate || date}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">
                          {bookingItem.type === 'hotel' ? 'End Date' : (bookingItem.type === 'event' ? 'End Time' : 'Arrival')}
                        </p>
                        <p className="text-[10px] font-black text-brand-secondary">{bookingItem.endTime || '--:--'}</p>
                        <p className="text-[8px] font-bold text-brand-primary/60">{bookingItem.endDate || date}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t border-brand-primary/20">
                      <span className="text-brand-primary/60 text-xs font-bold">Total Amount</span>
                      <span className="text-xl font-black text-brand-secondary">₹{(bookingItem.price || bookingItem.cost || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowBookingModal(false)}
                      className="flex-1 py-4 bg-brand-primary/10 text-brand-primary/80 font-black text-[10px] uppercase tracking-widest rounded-2xl"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleBook}
                      className="flex-1 py-4 bg-brand-primary text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-100"
                    >
                      Continue
                    </button>
                  </div>
                </>
              )}

              {bookingStatus === 'passenger_info' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-black text-brand-secondary mb-2">Passenger Info</h2>
                  <p className="text-brand-primary/60 text-sm">Please provide essential details for your booking.</p>
                  
                  {auth.currentUser && (
                    <button 
                      onClick={useGoogleInfo}
                      className="w-full py-3 bg-brand-primary/5 text-brand-primary text-[10px] font-black uppercase tracking-widest rounded-xl border border-brand-primary/10 flex items-center justify-center gap-2"
                    >
                      <User size={14} />
                      Use information from user info account
                    </button>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-brand-primary/40 uppercase tracking-widest ml-1">Full Name</label>
                      <input 
                        type="text" 
                        value={passengerInfo.name}
                        onChange={(e) => setPassengerInfo({...passengerInfo, name: e.target.value})}
                        placeholder="Enter passenger name"
                        className="w-full bg-brand-primary/5 border border-brand-primary/10 rounded-2xl px-4 py-3 text-xs font-bold text-brand-secondary"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-brand-primary/40 uppercase tracking-widest ml-1">Age</label>
                        <input 
                          type="number" 
                          value={passengerInfo.age}
                          onChange={(e) => setPassengerInfo({...passengerInfo, age: e.target.value})}
                          placeholder="Age"
                          className="w-full bg-brand-primary/5 border border-brand-primary/10 rounded-2xl px-4 py-3 text-xs font-bold text-brand-secondary"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-brand-primary/40 uppercase tracking-widest ml-1">Phone</label>
                        <input 
                          type="tel" 
                          value={passengerInfo.phone}
                          onChange={(e) => setPassengerInfo({...passengerInfo, phone: e.target.value})}
                          placeholder="Phone number"
                          className="w-full bg-brand-primary/5 border border-brand-primary/10 rounded-2xl px-4 py-3 text-xs font-bold text-brand-secondary"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-brand-primary/40 uppercase tracking-widest ml-1">Email ID</label>
                      <input 
                        type="email" 
                        value={passengerInfo.email}
                        onChange={(e) => setPassengerInfo({...passengerInfo, email: e.target.value})}
                        placeholder="Enter email address"
                        className="w-full bg-brand-primary/5 border border-brand-primary/10 rounded-2xl px-4 py-3 text-xs font-bold text-brand-secondary"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button 
                      onClick={() => setBookingStatus('idle')}
                      className="flex-1 py-4 bg-brand-primary/10 text-brand-primary/80 font-black text-[10px] uppercase tracking-widest rounded-2xl"
                    >
                      Back
                    </button>
                    <button 
                      onClick={handleConfirmPassenger}
                      className="flex-1 py-4 bg-brand-primary text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-100"
                    >
                      Direct Pay
                    </button>
                  </div>
                </div>
              )}

              {bookingStatus === 'paying' && (
                <div className="text-center py-4">
                  <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CreditCard size={32} />
                  </div>
                  <h2 className="text-2xl font-black text-brand-secondary mb-2">Payment Amount</h2>
                  <p className="text-brand-primary/60 mb-8 text-sm">Please confirm the amount for your {bookingItem.type} booking.</p>
                  
                  <div className="bg-brand-secondary text-white p-6 rounded-3xl mb-8 text-left relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-20">
                      <Zap size={40} />
                    </div>
                    <p className="text-white/50 text-[10px] font-black uppercase tracking-widest mb-1">Total Amount to Pay</p>
                    <p className="text-3xl font-black">₹{bookingItem.price?.toLocaleString() || '0'}</p>
                    <div className="mt-6 flex items-center gap-2">
                      <div className="w-8 h-5 bg-white/20 rounded" />
                      <div className="w-8 h-5 bg-white/20 rounded" />
                      <p className="text-[10px] font-bold text-white/40 ml-auto">SECURE GATEWAY</p>
                    </div>
                  </div>

                  <button 
                    onClick={handlePay}
                    disabled={isProcessing}
                    className="w-full py-4 bg-brand-primary text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-100 flex items-center justify-center gap-2"
                  >
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : `Confirm & Pay ₹${bookingItem.price?.toLocaleString() || '0'}`}
                  </button>
                </div>
              )}

              {bookingStatus === 'success' && (
                <div className="text-center py-4">
                  <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <ShieldCheck size={40} />
                  </div>
                  <h2 className="text-2xl font-black text-brand-secondary mb-1">Confirmed Successfully!</h2>
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-8">Booking ID: {bookingId}</p>
                  
                  <div className="bg-brand-primary/5 p-6 rounded-3xl mb-8 text-left space-y-4">
                    <div className="flex items-center justify-between pb-4 border-b border-brand-primary/10">
                      <div>
                        <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">Passenger</p>
                        <p className="text-xs font-black text-brand-secondary">{passengerInfo.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">Service</p>
                        <p className="text-xs font-black text-brand-secondary uppercase">{bookingItem.type}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">Origin</p>
                        <p className="text-xs font-black text-brand-secondary truncate">{from || 'N/A'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">Destination</p>
                        <p className="text-xs font-black text-brand-secondary truncate">{to || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">Departure</p>
                        <p className="text-xs font-black text-brand-secondary">{bookingItem.startTime || '--:--'}</p>
                        <p className="text-[8px] font-bold text-brand-primary/60">{bookingItem.startDate || date}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">Arrival</p>
                        <p className="text-xs font-black text-brand-secondary">{bookingItem.endTime || '--:--'}</p>
                        <p className="text-[8px] font-bold text-brand-primary/60">{bookingItem.endDate || date}</p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-brand-primary/20 flex items-center justify-between">
                      <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest">Amount Paid</p>
                      <p className="text-sm font-black text-brand-secondary">₹{bookingItem.price?.toLocaleString() || '0'}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <p className="text-[10px] font-bold text-brand-primary/40 uppercase tracking-widest">E-Ticket sent to {passengerInfo.email}</p>
                    <button 
                      onClick={handleSuccessDone}
                      className="w-full py-4 bg-brand-primary text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-100"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Message Modal */}
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

        {showSuccessMessage && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-brand-secondary/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <ShieldCheck size={32} />
              </div>
              <h2 className="text-2xl font-black text-brand-secondary mb-2 text-center">Ticket Booked!</h2>
              
              <p className="text-brand-primary/60 mb-8 text-sm text-center">
                The ticket is shared with you in your email account ({passengerInfo.email}).
              </p>
              
              <button 
                onClick={() => {
                  setShowSuccessMessage(false);
                  navigate('/profile');
                }}
                className="w-full py-4 bg-brand-primary text-white font-black text-[10px] uppercase tracking-widest rounded-2xl"
              >
                Okay
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
