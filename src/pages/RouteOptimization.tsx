import axios from 'axios';
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MapPin, Zap, DollarSign, Clock, Navigation, Info, CheckCircle2, Star, Leaf, Tag, ChevronRight, Bus, Car, Footprints, Train, ArrowRight, Plane, Bike, Compass, ShieldCheck, CreditCard, ArrowUpDown, User, AlertCircle, Loader2, X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import polyline from 'polyline';
import { RouteResults, SearchResult } from '../types';
import { useTravel } from '../lib/TravelContext';
import { auth, db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { generateJourneyBreakdown, JourneyOption } from '../lib/mistral';
import JourneyMap from '../components/JourneyMap';
import DestinationGallery from '../components/DestinationGallery';
import JourneyTicket from '../components/tickets/JourneyTicket';
import BookingFlow from '../components/booking/BookingFlow';
import { parseFirestoreData } from '../lib/utils';

// Fix Leaflet icon issue
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

function MapUpdater({ center, bounds }: { center: [number, number], bounds?: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else {
      map.setView(center, 13);
    }
  }, [center, bounds, map]);
  return null;
}

export default function RouteOptimization() {
  const [searchParams] = useSearchParams();
  const { from, to, time, selectedProviders, setSelectedProviders } = useTravel();
  const [routes, setRoutes] = useState<any>(null);
  const [providerOptions, setProviderOptions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [assistantMessage, setAssistantMessage] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<'shortest' | 'cheapest' | 'fastest' | 'best' | 'comfortable' | 'eco-friendly'>('best');
  const [coords, setCoords] = useState<{ from: [number, number], to: [number, number] } | null>(null);
  const [mapRouteData, setMapRouteData] = useState<any>(null);
  const [bookingItem, setBookingItem] = useState<any>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [confirmedJourney, setConfirmedJourney] = useState<any>(null);
  const [showJourneyTicket, setShowJourneyTicket] = useState(false);
  const [showLoginError, setShowLoginError] = useState(false);
  const navigate = useNavigate();

  // Smart Journey State
  const [smartJourneys, setSmartJourneys] = useState<JourneyOption[]>([]);
  const [selectedSmartJourney, setSelectedSmartJourney] = useState<JourneyOption | null>(null);
  const [isGeneratingSmart, setIsGeneratingSmart] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);

  const [mapError, setMapError] = useState<string | null>(null);

  const fetchAllData = async () => {
    if (!from || !to) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setIsGeneratingSmart(true);
    setSmartError(null);
    setMapError(null);

    try {
      // 1. Fetch Map Route & Coords
      let fromCoord: [number, number] = [19.076, 72.877];
      let toCoord: [number, number] = [18.520, 73.856];

      try {
        const mapRes = await axios.get(`/api/map-route?source=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}`);
        setMapRouteData(mapRes.data);
        fromCoord = [mapRes.data.source.lat, mapRes.data.source.lng];
        toCoord = [mapRes.data.destination.lat, mapRes.data.destination.lng];
        setCoords({ from: fromCoord, to: toCoord });
      } catch (err) {
        console.error("Map route fetch failed:", err);
        setMapError("Could not load map route. Using estimated coordinates.");
        
        // Fallback to geocode API if map-route fails
        try {
          const [fRes, tRes] = await Promise.all([
            axios.get(`/api/geocode?address=${encodeURIComponent(from)}`),
            axios.get(`/api/geocode?address=${encodeURIComponent(to)}`)
          ]);
          fromCoord = [fRes.data.lat, fRes.data.lon];
          toCoord = [tRes.data.lat, tRes.data.lon];
          setCoords({ from: fromCoord, to: toCoord });
        } catch (geoErr) {
          console.error("Geocoding fallback failed:", geoErr);
        }
      }

      // 2. Calculate Distance for Provider Routes
      const getDistance = (c1: [number, number], c2: [number, number]) => {
        const R = 6371;
        const dLat = (c2[0] - c1[0]) * Math.PI / 180;
        const dLon = (c2[1] - c1[1]) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(c1[0] * Math.PI / 180) * Math.cos(c2[0] * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };
      const distance = getDistance(fromCoord, toCoord);

      // 3. Fetch Provider Routes & Smart Journeys
      const providersParam = encodeURIComponent(JSON.stringify(selectedProviders));
      
      const [routesRes, smartJourneysData] = await Promise.all([
        axios.get(`/api/routes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&distance=${distance}&time=${time}&selectedProviders=${providersParam}`),
        generateJourneyBreakdown(from, to, time || '09:00', selectedProviders).catch(err => {
          console.error("Smart journey failed:", err);
          setSmartError("AI route generation failed. Showing standard options.");
          return [];
        })
      ]);

      setRoutes(routesRes.data.routes);
      setProviderOptions(routesRes.data.providerOptions);
      setSmartJourneys(smartJourneysData);

    } catch (error) {
      console.error("General data fetch failed:", error);
    } finally {
      setLoading(false);
      setIsGeneratingSmart(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [from, to, time, selectedProviders]);

  useEffect(() => {
    if (smartJourneys.length > 0) {
      const journey = smartJourneys.find(j => j.category === selectedRoute) || smartJourneys[0];
      setSelectedSmartJourney(journey);
    }
  }, [selectedRoute, smartJourneys]);

  const handleBook = (item?: any) => {
    const targetItem = item || bookingItem;
    if (!targetItem) return;
    
    if (!auth.currentUser) {
      setShowLoginError(true);
      return;
    }
    
    setShowBookingModal(true);
  };

  if (!from || !to) {
    return (
      <div className="flex flex-col min-h-screen bg-brand-primary/5 pb-32">
        <div className="app-header-gradient pt-10 pb-8 px-6 rounded-b-[40px] relative overflow-hidden shrink-0 mb-8">
          <div className="absolute top-[-20px] left-[-20px] w-32 h-32 bg-white/10 rounded-full blur-2xl" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center text-white">
              <Navigation size={20} />
            </div>
            <div>
              <h1 className="text-white font-black text-lg leading-none">Smart Travel</h1>
              <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-1">Smart Planning</p>
            </div>
          </div>
        </div>

        <div className="px-6 space-y-8">
          <div className="text-center py-8 bg-white rounded-[32px] border border-brand-primary/5 shadow-sm">
            <div className="w-16 h-16 bg-brand-primary/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <MapPin size={24} className="text-brand-primary/20" />
            </div>
            <h3 className="text-sm font-black text-brand-secondary mb-1">Where are you heading?</h3>
            <p className="text-[10px] font-bold text-brand-primary/40 uppercase tracking-widest">Enter details on Explore page</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-brand-primary/5">
        <motion.div
          animate={{ scale: [1, 1.1, 1], rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-20 h-20 bg-brand-primary/10 rounded-3xl flex items-center justify-center text-brand-primary mb-6"
        >
          <Navigation size={40} />
        </motion.div>
        <h2 className="text-lg font-black text-brand-secondary uppercase tracking-widest mb-2">Smart Travel</h2>
        <p className="text-xs font-bold text-brand-primary/40">Finding the possible travel mode for your journey</p>
      </div>
    );
  }

  const currentRoutes = Array.isArray(routes?.[selectedRoute]) ? routes[selectedRoute] : [];
  const mapBounds = coords ? L.latLngBounds([coords.from, coords.to]) : undefined;

  return (
    <div className="flex flex-col min-h-screen bg-brand-primary/5">
      {/* Booking Modal */}
      <AnimatePresence>
        {showBookingModal && bookingItem && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-white rounded-[40px] overflow-hidden shadow-2xl"
            >
              <BookingFlow 
                service="multi-modal"
                initialData={{
                  ...bookingItem,
                  steps: selectedSmartJourney?.steps || []
                }}
                onComplete={(rawData) => {
                  const data = parseFirestoreData(rawData);
                  setConfirmedJourney({
                    id: data.bookingId,
                    from: bookingItem.from,
                    to: bookingItem.to,
                    distance: bookingItem.duration, 
                    time: bookingItem.duration,
                    cost: data.totalCost,
                    steps: data.segments,
                    startDate: data.details?.date || new Date().toLocaleDateString(),
                    passengerName: data.user?.name || data.passengerName,
                    email: data.user?.email || data.email,
                    phone: data.user?.phone || data.phone
                  });
                  setShowBookingModal(false);
                  // No longer showing modal, showing inline
                }}
                onCancel={() => setShowBookingModal(false)}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Journey Ticket Modal removed to show inline */}

      {/* Header with Gradient */}
      <div className="app-header-gradient pt-6 pb-12 px-6 rounded-b-[40px] relative overflow-hidden shrink-0">
        <div className="absolute top-[-20px] left-[-20px] w-32 h-32 bg-white/10 rounded-full blur-2xl" />
        
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center text-white">
              <Navigation size={20} />
            </div>
            <div>
              <h1 className="text-white font-black text-lg leading-none">Smart Travel</h1>
              <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-1">Smart Planning</p>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl flex items-center gap-2">
            <Clock size={12} className="text-amber-400" />
            <span className="text-white text-[10px] font-black">{time}</span>
          </div>
        </div>

        <div className="flex flex-col gap-4 bg-white/10 backdrop-blur-md p-5 rounded-[32px] border border-white/10 shadow-inner">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 bg-emerald-400/20 rounded-xl flex items-center justify-center shrink-0 mt-1">
              <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
            </div>
            <div className="flex-1">
              <p className="text-white/50 text-[9px] font-black uppercase tracking-widest mb-1">Full Source Address</p>
              <p className="text-white font-black text-sm leading-relaxed">{from}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 px-2">
            <div className="w-8 flex justify-center">
              <div className="w-0.5 h-6 bg-white/10" />
            </div>
            <div className="bg-white/10 px-3 py-1 rounded-full border border-white/5">
              <ArrowRight size={14} className="text-white/40" />
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-8 h-8 bg-rose-400/20 rounded-xl flex items-center justify-center shrink-0 mt-1">
              <MapPin size={16} className="text-rose-400" />
            </div>
            <div className="flex-1">
              <p className="text-white/50 text-[9px] font-black uppercase tracking-widest mb-1">Full Destination Address</p>
              <p className="text-white font-black text-sm leading-relaxed">{to}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 mt-4 space-y-6 pb-32 relative z-10">
        {/* 🎫 CONFIRMED JOURNEY TICKET (INLINE) */}
        {confirmedJourney && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
                <ShieldCheck size={18} />
              </div>
              <h2 className="text-sm font-black text-brand-secondary uppercase tracking-widest">Your Confirmed Journey</h2>
            </div>
            <div className="max-w-sm mx-auto">
              <JourneyTicket 
                journey={confirmedJourney}
                onClose={() => {
                  setConfirmedJourney(null);
                  setShowJourneyTicket(false);
                }}
              />
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => navigate('/profile')}
                className="flex-1 h-14 bg-brand-secondary text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg"
              >
                View in Profile
              </button>
              <button 
                onClick={() => setConfirmedJourney(null)}
                className="flex-1 h-14 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest"
              >
                Plan Another
              </button>
            </div>
          </motion.div>
        )}

        {/* 📊 JOURNEY OPTIONS LIST */}
        {!confirmedJourney && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600">
                  <Sparkles size={18} />
                </div>
                <h2 className="text-sm font-black text-brand-secondary uppercase tracking-widest">AI Travel Plan</h2>
              </div>
              <div className="flex items-center gap-2 bg-brand-primary/5 px-3 py-1 rounded-full border border-brand-primary/10">
                <span className="text-[9px] font-black text-brand-primary/60 uppercase tracking-widest">Smart Selection</span>
              </div>
            </div>

            {/* 🏷️ Route Selection Tabs */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
              {[
                { id: 'best', label: 'Best', icon: Zap },
                { id: 'fastest', label: 'Fastest', icon: Clock },
                { id: 'cheapest', label: 'Cheapest', icon: DollarSign },
                { id: 'comfortable', label: 'Premium', icon: Star },
                { id: 'eco-friendly', label: 'Eco', icon: Leaf },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedRoute(tab.id as any)}
                  className={`px-4 py-2.5 rounded-2xl flex items-center gap-2 whitespace-nowrap transition-all text-[10px] font-black uppercase tracking-widest ${
                    selectedRoute === tab.id 
                      ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' 
                      : 'bg-white text-brand-secondary border border-brand-primary/10 hover:border-brand-primary/30'
                  }`}
                >
                  <tab.icon size={12} />
                  {tab.label}
                </button>
              ))}
            </div>

            {isGeneratingSmart ? (
              <div className="bg-white p-12 rounded-[32px] border border-brand-primary/10 shadow-sm flex flex-col items-center justify-center">
                <div className="relative mb-4">
                  <Loader2 size={40} className="animate-spin text-brand-primary" />
                  <Sparkles size={16} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-amber-400" />
                </div>
                <p className="text-xs font-black text-brand-secondary uppercase tracking-widest">AI is calculation best travel modes</p>
                <p className="text-[10px] text-brand-primary/40 mt-2 font-bold">Optimizing for {selectedRoute}</p>
              </div>
            ) : smartJourneys.length > 0 ? (
              <div className="space-y-6">
                {/* Gallery for Smart Journey */}
                <div className="grid grid-cols-1 gap-6">
                  <div className="relative group">
                    <DestinationGallery placeName={to} />
                    <div className="absolute top-4 right-4 z-10">
                      <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-lg border border-brand-primary/10 flex items-center gap-2">
                        <Star size={12} className="text-amber-500 fill-amber-500" />
                        <span className="text-[10px] font-black text-brand-secondary uppercase tracking-widest">Top Destination</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Smart Journey Selection Cards */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-brand-primary/40 uppercase tracking-widest px-1">Select an Option</p>
                  <div className="flex gap-3 overflow-x-auto no-scrollbar pb-4 -mx-1 px-1">
                    {smartJourneys.filter(j => j.category === selectedRoute || (!j.category && selectedRoute === 'best')).map((journey) => (
                      <motion.div
                        key={journey.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedSmartJourney(journey)}
                        className={`min-w-[240px] p-5 rounded-[28px] border-2 transition-all cursor-pointer relative overflow-hidden ${
                          selectedSmartJourney?.id === journey.id 
                            ? 'border-brand-primary bg-brand-primary/5 shadow-xl shadow-brand-primary/10' 
                            : 'border-brand-primary/5 bg-white hover:border-brand-primary/20'
                        }`}
                      >
                        {/* Rating Badge */}
                        <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-xl shadow-sm border border-brand-primary/5 z-10">
                          <Star size={10} className="text-amber-500 fill-amber-500" />
                          <span className="text-[9px] font-black text-brand-secondary">
                            {journey.category === 'fastest' ? '9.8' : 
                             journey.category === 'cheapest' ? '9.2' :
                             journey.category === 'eco-friendly' ? '9.9' :
                             journey.category === 'comfortable' ? '9.5' : '9.6'}
                          </span>
                        </div>

                        {journey.smartTag && (
                          <div className="absolute top-0 left-0">
                            <div className="bg-amber-400 text-white text-[8px] font-black px-3 py-1 rounded-br-xl shadow-sm flex items-center gap-1 uppercase tracking-widest">
                              <Sparkles size={8} />
                              {journey.smartTag}
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between mb-4 mt-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                              journey.category === 'fastest' ? 'bg-amber-50 text-amber-600' :
                              journey.category === 'cheapest' ? 'bg-emerald-50 text-emerald-600' :
                              journey.category === 'eco-friendly' ? 'bg-green-50 text-green-600' :
                              journey.category === 'comfortable' ? 'bg-purple-50 text-purple-600' :
                              'bg-brand-primary/10 text-brand-primary'
                            }`}>
                              {journey.category === 'fastest' ? <Zap size={14} /> : 
                               journey.category === 'cheapest' ? <DollarSign size={14} /> :
                               journey.category === 'eco-friendly' ? <Leaf size={14} /> :
                               journey.category === 'comfortable' ? <Star size={14} /> : <Clock size={14} />}
                            </div>
                            <div>
                              <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest leading-none mb-1">Departure</p>
                              <p className="text-xs font-black text-brand-secondary">{journey.departureTime}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest leading-none mb-1">Total Cost</p>
                            <p className="text-sm font-black text-brand-secondary">₹{journey.totalCost?.toLocaleString() || '0'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mb-4">
                          <div className="flex -space-x-2">
                            {journey.modes.map((mode, i) => (
                              <div key={i} className="w-7 h-7 bg-white border-2 border-brand-primary/5 rounded-full flex items-center justify-center text-brand-primary shadow-sm z-10">
                                {mode === 'flight' ? <Plane size={12} /> : 
                                 mode === 'train' ? <Train size={12} /> :
                                 mode === 'cab' ? <Car size={12} /> : 
                                 mode === 'walking' ? <Footprints size={12} /> : <Navigation size={12} />}
                              </div>
                            ))}
                          </div>
                          <div className="h-px flex-1 bg-brand-primary/10" />
                          <span className="text-[9px] font-black text-brand-primary/60 uppercase tracking-widest">{journey.totalDuration}</span>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-brand-primary/5">
                          <span className="text-[9px] font-bold text-brand-primary/40 uppercase tracking-widest">View Details</span>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${selectedSmartJourney?.id === journey.id ? 'bg-brand-primary text-white' : 'bg-brand-primary/5 text-brand-primary'}`}>
                            <ChevronRight size={14} />
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Detailed Steps for Selected Smart Journey */}
                {selectedSmartJourney && (
                  <div className="bg-white p-6 rounded-[32px] border border-brand-primary/10 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xs font-black text-brand-secondary uppercase tracking-widest">Journey Timeline</h3>
                      <div className="bg-brand-primary/5 px-3 py-1 rounded-full flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-brand-primary rounded-full" />
                        <span className="text-[9px] font-black text-brand-primary/60 uppercase tracking-widest">{selectedSmartJourney.modes.length} Segments</span>
                      </div>
                    </div>

                    <div className="space-y-4 relative">
                      {/* Vertical Line */}
                      <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-brand-primary/10" />
                      
                      {selectedSmartJourney.steps.map((step, i) => (
                        <div key={i} className="flex gap-4 relative z-10">
                          <div className="flex flex-col items-center">
                            <div className="w-8 h-8 bg-white border-2 border-brand-primary rounded-xl flex items-center justify-center text-brand-primary shrink-0 shadow-md z-20">
                              {step.mode === 'flight' ? <Plane size={16} /> : 
                               step.mode === 'train' ? <Train size={16} /> :
                               step.mode === 'cab' ? <Car size={16} /> : 
                               step.mode === 'walking' ? <Footprints size={16} /> : <Navigation size={16} />}
                            </div>
                            <div className="text-[8px] font-black text-brand-primary/40 mt-2 uppercase">{step.time}</div>
                          </div>
                          <div className="flex-1 bg-white p-4 rounded-2xl border border-brand-primary/10 hover:border-brand-primary/30 transition-all shadow-sm min-w-0 overflow-hidden box-border">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <h4 className="text-[11px] font-black text-brand-secondary">
                                  {typeof step.from === 'object' ? (step.from as any).name : step.from}
                                </h4>
                                <ArrowRight size={10} className="text-brand-primary/40 shrink-0" />
                                <h4 className="text-[11px] font-black text-brand-secondary">
                                  {typeof step.to === 'object' ? (step.to as any).name : step.to}
                                </h4>
                              </div>
                              <div className="flex items-center gap-1 bg-brand-primary/5 px-2 py-0.5 rounded-lg self-start sm:self-auto shrink-0">
                                <Clock size={8} className="text-brand-primary/40" />
                                <span className="text-[9px] font-black text-brand-primary/60">{step.duration}</span>
                              </div>
                            </div>
                            <p className="text-[10px] text-brand-primary/70 font-medium leading-relaxed mb-3 break-words whitespace-normal">{step.description}</p>
                            <div className="flex items-center justify-between pt-2 border-t border-brand-primary/5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[9px] font-black text-brand-secondary uppercase tracking-widest truncate">{step.provider}</span>
                              </div>
                              <div className="px-2 py-0.5 bg-brand-primary/10 text-brand-primary text-[8px] font-black uppercase tracking-widest rounded shrink-0">
                                {step.mode}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <button 
                      onClick={() => {
                        const item = {
                          id: selectedSmartJourney.id,
                          type: 'Smart Journey',
                          provider: selectedSmartJourney.steps[0].provider,
                          price: selectedSmartJourney.totalCost,
                          duration: selectedSmartJourney.totalDuration,
                          time: selectedSmartJourney.departureTime,
                          from: from,
                          to: to
                        };
                        setBookingItem(item);
                        handleBook(item);
                      }}
                      className="w-full mt-10 bg-brand-primary text-white py-6 rounded-[32px] font-black text-sm uppercase tracking-[0.2em] shadow-[0_20px_40px_rgba(79,70,229,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-4 group"
                    >
                      <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform">
                        <ShieldCheck size={20} />
                      </div>
                      <span>Book Full Route Now</span>
                      <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white p-12 rounded-[32px] border border-brand-primary/10 shadow-sm text-center">
                <AlertCircle size={32} className="text-brand-primary/20 mx-auto mb-4" />
                <p className="text-xs font-black text-brand-secondary uppercase tracking-widest">No AI routes found</p>
                <button onClick={fetchAllData} className="mt-4 text-[10px] font-black text-brand-primary uppercase tracking-widest underline">Try Again</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🔮 Fixed Travel Assistant Input Bar removed as per request */}
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
    </div>
  );
}
