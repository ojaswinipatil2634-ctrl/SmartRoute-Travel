import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, MapPin, Users, CreditCard, ChevronRight, ChevronLeft, 
  Plane, Train, Car, Hotel, Ticket, CheckCircle2, Loader2,
  Mail, Phone, User, ShieldCheck, Clock, Star, Zap
} from 'lucide-react';
import { auth, db } from '../../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { sanitizeFirestoreData } from '../../lib/utils';

interface BookingFlowProps {
  service: 'flight' | 'train' | 'cab' | 'hotel' | 'event' | 'multi-modal';
  initialData?: any;
  onComplete: (bookingData: any) => void;
  onCancel: () => void;
}

export default function BookingFlow({ service, initialData, onComplete, onCancel }: BookingFlowProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    // Common
    passengerName: auth.currentUser?.displayName || '',
    email: auth.currentUser?.email || '',
    phone: '',
    
    // Service Specific
    from: initialData?.from || '',
    to: initialData?.to || '',
    date: initialData?.date || '',
    returnDate: '',
    guests: initialData?.guests || 1,
    rooms: initialData?.rooms || 1,
    roomType: initialData?.roomType || 'Standard',
    class: initialData?.class || 'Economy',
    seatPreference: initialData?.seatPreference || 'Window',
    berthPreference: initialData?.berthPreference || 'Lower',
    cabType: initialData?.cabType || initialData?.name || 'Sedan',
    passengers: initialData?.passengers || 1,
    eventName: initialData?.eventName || initialData?.name || '',
    venue: initialData?.venue || '',
    tickets: initialData?.tickets || 1,
    seatType: initialData?.seatType || 'Regular',
    specialRequests: '',
    provider: initialData?.provider || initialData?.name || '',
    breakfastIncluded: false,
    pickupTime: '10:00',
    ...initialData
  });

  const totalSteps = 4;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as any;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const nextStep = () => setStep(prev => Math.min(prev + 1, totalSteps));
  const prevStep = () => setStep(prev => Math.max(prev - 1, 1));

  const handleSubmit = async () => {
    if (!auth.currentUser) {
      alert("Please sign in to confirm your booking.");
      return;
    }
    setLoading(true);
    
    try {
      // In a real app, this would call a payment gateway first
      const bookingId = `TS-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      
      // Map time fields based on service type
      let startTime = '';
      let endTime = '';
      let arrivalTime = '';

      if (service === 'hotel' || service === 'event') {
        startTime = formData.startTime || formData.entryTime || formData.checkIn || formData.time || '09:00 AM';
        endTime = formData.endTime || formData.exitTime || formData.checkOut || '11:00 AM';
      } else if (service === 'multi-modal') {
        startTime = initialData.time || initialData.departureTime || '09:00 AM';
        endTime = initialData.arrivalTime || '05:00 PM';
      } else {
        // flight, train, cab
        startTime = formData.departureTime || formData.startTime || formData.pickupTime || formData.time || '09:00 AM';
        endTime = formData.arrivalTime || formData.endTime || '05:00 PM';
        arrivalTime = formData.arrivalTime || '';
      }

      const rawBookingData = {
        bookingId,
        bookingType: service,
        userId: auth.currentUser.uid, // Keep for querying
        user: {
          name: formData.passengerName || 'Guest',
          email: formData.email || '',
          phone: formData.phone || ''
        },
        provider: formData.provider || (service === 'multi-modal' ? 'Multi-Modal Journey' : 'Verified Partner Service'),
        details: {
          startTime,
          endTime,
          arrivalTime,
          from: (service === 'multi-modal' ? initialData.from : formData.from) || 'N/A',
          to: (service === 'multi-modal' ? initialData.to : formData.to) || 'N/A',
          date: (service === 'multi-modal' ? (initialData.startDate || initialData.date) : formData.date) || new Date().toISOString().split('T')[0],
          price: (service === 'multi-modal' ? initialData.price : formData.price) || 0,
          service: service
        },
        // Ensure segments are flattened (no nested arrays in steps)
        segments: service === 'multi-modal' ? (initialData.steps || []).map((step: any) => {
          // Remove coordinates which are nested arrays
          const { coordinates, path, ...rest } = step; 
          return {
            ...rest,
            startTime: step.startTime || step.time || '09:00 AM',
            endTime: step.endTime || step.arrivalTime || '10:00 AM'
          };
        }) : null,
        totalCost: service === 'multi-modal' ? (initialData.price || 0) : (formData.price || 0),
        status: 'confirmed',
        createdAt: new Date().toISOString()
      };

      // Production-ready sanitization: Recursively remove all undefined values and handle nested arrays
      const bookingData = sanitizeFirestoreData(rawBookingData);

      // Defensive check before saving
      if (!bookingData.details.date) {
        console.warn('Booking missing date, applying fallback');
        bookingData.details.date = new Date().toISOString().split('T')[0];
      }

      console.log('Saving sanitized booking data:', bookingData);

      // Save to Firestore
      await addDoc(collection(db, 'tickets'), bookingData);

      // Send Email via API
      try {
        await fetch('/api/send-ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: bookingData.user.email,
            bookingId: bookingId,
            passengerName: bookingData.user.name,
            provider: bookingData.provider,
            details: bookingData.details,
            segments: bookingData.segments
          })
        });
      } catch (emailError) {
        console.error('Failed to send email:', emailError);
      }

      if (onComplete) {
        onComplete(bookingData);
      } else {
        // Navigate to success page if no onComplete handler is provided
        navigate('/success', { state: bookingData });
      }
    } catch (error) {
      console.error('Booking failed:', error);
      alert("Booking failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => (
        <div className="flex items-center justify-between mb-5 px-2">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center flex-1 last:flex-none">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
            step >= s ? 'bg-brand-primary text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-400'
          }`}>
            {step > s ? <CheckCircle2 size={16} /> : s}
          </div>
          {s < 3 && (
            <div className={`flex-1 h-1 mx-2 rounded-full transition-all duration-300 ${
              step > s ? 'bg-brand-primary' : 'bg-slate-100'
            }`} />
          )}
        </div>
      ))}
    </div>
  );

  const renderServiceForm = () => {
    switch (service) {
      case 'flight':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Airline</label>
                <input name="provider" value={formData.provider} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" placeholder="e.g. Indigo" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Class</label>
                <select name="class" value={formData.class} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold">
                  <option>Economy</option>
                  <option>Business</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">From</label>
                <input name="from" value={formData.from} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">To</label>
                <input name="to" value={formData.to} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Departure</label>
                <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Seat Pref</label>
                <select name="seatPreference" value={formData.seatPreference} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold">
                  <option>Window</option>
                  <option>Aisle</option>
                  <option>Middle</option>
                </select>
              </div>
            </div>
          </div>
        );
      case 'hotel':
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hotel Name</label>
              <input name="provider" value={formData.provider} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" placeholder="e.g. Taj Hotel" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Start Date</label>
                <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">End Date</label>
                <input type="date" name="returnDate" value={formData.returnDate} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Room Type</label>
                <select name="roomType" value={formData.roomType} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold">
                  <option>Standard</option>
                  <option>Deluxe</option>
                  <option>Suite</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input type="checkbox" name="breakfastIncluded" checked={formData.breakfastIncluded} onChange={handleInputChange} className="w-4 h-4 rounded border-slate-300 text-brand-primary" />
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Breakfast</label>
              </div>
            </div>
          </div>
        );
      case 'cab':
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pickup Location</label>
              <input name="from" value={formData.from} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Drop Location</label>
              <input name="to" value={formData.to} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pickup Time</label>
                <input type="time" name="pickupTime" value={formData.pickupTime} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vehicle Type</label>
                <select name="cabType" value={formData.cabType} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold">
                  <option>Mini</option>
                  <option>Sedan</option>
                  <option>SUV</option>
                </select>
              </div>
            </div>
          </div>
        );
      case 'train':
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Train Name/No</label>
              <input name="provider" value={formData.provider} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" placeholder="e.g. Rajdhani Exp (12301)" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">From Station</label>
                <input name="from" value={formData.from} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">To Station</label>
                <input name="to" value={formData.to} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Coach Type</label>
                <select name="class" value={formData.class} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold">
                  <option>Sleeper (SL)</option>
                  <option>3rd AC (3A)</option>
                  <option>2nd AC (2A)</option>
                  <option>1st AC (1A)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Berth Pref</label>
                <select name="berthPreference" value={formData.berthPreference} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold">
                  <option>Lower</option>
                  <option>Middle</option>
                  <option>Upper</option>
                  <option>Side Lower</option>
                </select>
              </div>
            </div>
          </div>
        );
      case 'event':
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Event Name</label>
              <input name="provider" value={formData.provider} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Venue Address</label>
              <input name="venue" value={formData.venue} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Start Time</label>
                <input type="time" name="startTime" value={formData.startTime} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">End Time</label>
                <input type="time" name="endTime" value={formData.endTime} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Date</label>
                <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pass Type</label>
                <select name="seatType" value={formData.seatType} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold">
                  <option>Regular</option>
                  <option>VIP</option>
                  <option>VVIP</option>
                </select>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-sm rounded-[40px] overflow-y-auto max-h-[90vh] shadow-2xl no-scrollbar"
      >
        {/* Header */}
        <div className="app-header-gradient p-6 text-white relative">
          <button onClick={onCancel} className="absolute top-5 right-5 w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center hover:bg-white/30 transition-all">
            <X size={20} />
          </button>
          <div className="flex items-center gap-4 mb-1">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              {service === 'flight' && <Plane size={24} />}
              {service === 'train' && <Train size={24} />}
              {service === 'cab' && <Car size={24} />}
              {service === 'hotel' && <Hotel size={24} />}
              {service === 'event' && <Ticket size={24} />}
            </div>
            <div>
              <h2 className="text-xl font-black capitalize">{service} Booking</h2>
              <p className="text-white/60 text-[10px] font-black uppercase tracking-widest">Step {step} of 3</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {renderStepIndicator()}

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div 
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-2 h-6 bg-brand-primary rounded-full" />
                  <h3 className="text-sm font-black text-brand-secondary uppercase tracking-wider">Service Details</h3>
                </div>
                {renderServiceForm()}
              </motion.div>
            )}

            {step === 2 && (
              <motion.div 
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-2 h-6 bg-brand-primary rounded-full" />
                  <h3 className="text-sm font-black text-brand-secondary uppercase tracking-wider">Passenger Info</h3>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Full Name</label>
                    <div className="relative">
                      <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input name="passengerName" value={formData.passengerName} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 py-3 text-xs font-bold" required />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email Address</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 py-3 text-xs font-bold" required />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Phone Number</label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="+91 98765 43210" className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 py-3 text-xs font-bold" required />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div 
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-2 h-6 bg-brand-primary rounded-full" />
                  <h3 className="text-sm font-black text-brand-secondary uppercase tracking-wider">Review Details</h3>
                </div>
                <div className="bg-slate-50 rounded-3xl p-4 border border-slate-100 space-y-3">
                  {service === 'multi-modal' && initialData.steps ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Journey</span>
                        <span className="text-xs font-black text-brand-secondary">{initialData.from} → {initialData.to}</span>
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transport Providers</p>
                        <div className="flex flex-wrap gap-1.5">
                          {Array.from(new Set(initialData.steps.map((s: any) => s.provider))).map((provider: any, idx) => (
                            <div key={idx} className="bg-brand-primary/5 px-2.5 py-1 rounded-xl border border-brand-primary/10">
                              <span className="text-[9px] font-black text-brand-primary uppercase tracking-wider">{provider}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 relative pl-4 border-l-2 border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest -ml-4 mb-1">Service Breakdown</p>
                        {initialData.steps?.map((step: any, idx: number) => (
                          <div key={idx} className="relative">
                            <div className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-brand-primary" />
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-[9px] font-black text-brand-primary uppercase">{step.mode}</p>
                                <p className="text-[10px] font-bold text-brand-secondary">{step.provider}</p>
                                <p className="text-[8px] text-slate-400">{step.details || 'Standard Service'}</p>
                              </div>
                              <p className="text-[9px] font-bold text-slate-400">{step.startTime}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : service === 'multi-modal' ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Journey</span>
                        <span className="text-xs font-black text-brand-secondary">{initialData.from} → {initialData.to}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Service</span>
                        <span className="text-xs font-black text-brand-secondary capitalize">{service}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Provider</span>
                        <span className="text-xs font-black text-brand-secondary">{formData.provider || 'Verified Partner Service'}</span>
                      </div>
                    </>
                  )}
                  
                  {service === 'flight' && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Route</span>
                        <span className="text-xs font-black text-brand-secondary">{formData.from} → {formData.to}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Class / Seat</span>
                        <span className="text-xs font-black text-brand-secondary">{formData.class} / {formData.seatPreference}</span>
                      </div>
                    </>
                  )}
                  {service === 'hotel' && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start / End</span>
                        <span className="text-xs font-black text-brand-secondary">{formData.date} to {formData.returnDate}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Room / Breakfast</span>
                        <span className="text-xs font-black text-brand-secondary">{formData.roomType} / {formData.breakfastIncluded ? 'Yes' : 'No'}</span>
                      </div>
                    </>
                  )}
                  {service === 'train' && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stations</span>
                        <span className="text-xs font-black text-brand-secondary">{formData.from} → {formData.to}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Coach / Berth</span>
                        <span className="text-xs font-black text-brand-secondary">{formData.class} / {formData.berthPreference}</span>
                      </div>
                    </>
                  )}
                  {service === 'cab' && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pickup</span>
                        <span className="text-xs font-black text-brand-secondary">{formData.from} @ {formData.pickupTime}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vehicle</span>
                        <span className="text-xs font-black text-brand-secondary">{formData.cabType}</span>
                      </div>
                    </>
                  )}
                  {service === 'event' && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Venue</span>
                        <span className="text-xs font-black text-brand-secondary truncate max-w-[150px]">{formData.venue}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start / End</span>
                        <span className="text-xs font-black text-brand-secondary">{formData.startTime} to {formData.endTime}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pass Type</span>
                        <span className="text-xs font-black text-brand-secondary">{formData.seatType}</span>
                      </div>
                    </>
                  )}

                  <div className="h-px bg-slate-200" />
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Passenger</span>
                      <span className="text-xs font-black text-brand-secondary">{formData.passengerName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</span>
                      <span className="text-xs font-black text-brand-secondary">{formData.email}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact</span>
                      <span className="text-xs font-black text-brand-secondary">{formData.phone}</span>
                    </div>
                  </div>

                  <div className="h-px bg-slate-200" />
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Amount</span>
                    <span className="text-lg font-black text-brand-primary">₹{(service === 'multi-modal' ? initialData.price : formData.price)?.toLocaleString() || '0'}</span>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div 
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="text-center py-6"
              >
                <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CreditCard size={32} />
                </div>
                <h2 className="text-2xl font-black text-brand-secondary mb-2">Payment Amount</h2>
                <p className="text-slate-400 mb-8 text-xs font-bold uppercase tracking-widest">Please confirm the amount for your booking.</p>
                
                <div className="bg-brand-secondary text-white p-6 rounded-3xl mb-8 text-left relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-20">
                    <Zap size={40} />
                  </div>
                  <p className="text-white/50 text-[10px] font-black uppercase tracking-widest mb-1">Total Amount to Pay</p>
                  <p className="text-3xl font-black">₹{(service === 'multi-modal' ? initialData.price : formData.price)?.toLocaleString() || '0'}</p>
                  <div className="mt-6 flex items-center gap-2">
                    <div className="w-8 h-5 bg-white/20 rounded" />
                    <div className="w-8 h-5 bg-white/20 rounded" />
                    <p className="text-[10px] font-bold text-white/40 ml-auto uppercase">Secure Gateway</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <ShieldCheck className="text-emerald-500" size={20} />
                  <p className="text-[10px] font-bold text-emerald-700">Secure payment processed via encrypted gateway.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation */}
          {step <= 4 && (
            <div className="flex gap-4 mt-6">
              {step > 1 && (
                <button 
                  onClick={prevStep}
                  className="flex-1 h-14 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-200 transition-all"
                >
                  <ChevronLeft size={16} /> Back
                </button>
              )}
              <button 
                onClick={step === 4 ? handleSubmit : nextStep}
                disabled={loading}
                className="flex-[2] h-14 bg-brand-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    {step === 3 ? 'Direct Pay' : step === 4 ? 'Confirm & Pay' : 'Continue'} <ChevronRight size={16} />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function X({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
    </svg>
  );
}
