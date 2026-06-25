import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs, orderBy, serverTimestamp } from 'firebase/firestore';
import { motion } from 'motion/react';
import { User, LogOut, Ticket, Calendar, Clock, CreditCard, ChevronRight, ShieldCheck, Tag, AlertCircle, CheckCircle2, Phone, Mail, Hash } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';

import { parseFirestoreData } from '../lib/utils';

interface Booking {
  id: string;
  itemDetails: {
    name: string;
    provider: string;
    type: string;
    duration: string;
    startTime?: string;
    endTime?: string;
    startDate?: string;
    endDate?: string;
  };
  price: number;
  createdAt: any;
  status: string;
  bookingId?: string;
  source?: string;
  destination?: string;
  passengerInfo?: {
    name: string;
    age: string;
    phone: string;
    email: string;
  };
}

export default function Profile() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showRefundMessage, setShowRefundMessage] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBookings = async () => {
      if (!auth.currentUser) return;
      
      try {
        const q = query(
          collection(db, 'tickets'),
          where('userId', '==', auth.currentUser.uid)
        );
        const snapshot = await getDocs(q);
        const uniqueBookings = new Map();
        snapshot.docs.forEach(doc => {
          const data = parseFirestoreData(doc.data());
          // Use bookingId or doc.id as key to prevent duplicates
          const key = data.bookingId || doc.id;
          if (!uniqueBookings.has(key)) {
            uniqueBookings.set(key, { 
              id: doc.id, 
              ...data,
              // Map to old structure for UI compatibility if needed
              itemDetails: {
                name: data.details?.service || data.service,
                provider: data.provider || data.details?.provider || data.service,
                type: data.bookingType || data.type,
                duration: data.totalDuration || 'TBD',
                startTime: data.details?.startTime || data.dateTime,
                startDate: data.details?.date || data.dateTime?.split(',')[0]
              },
              passengerInfo: {
                name: data.user?.name || data.passengerName,
                phone: data.user?.phone || data.phone,
                email: data.user?.email || data.email
              }
            });
          }
        });

        const data = Array.from(uniqueBookings.values())
          .sort((a: any, b: any) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA; // Descending
          });
        setBookings(data);
      } catch (error: any) {
        console.error("Error fetching bookings:", error);
        if (error.message?.includes('requires an index')) {
          alert("This view requires a Firestore Index. Please check the console log for the creation link or visit your Firebase Console to enable it.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  const handleCancelClick = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setShowCancelConfirm(true);
  };

  const confirmCancel = async () => {
    if (!selectedBookingId) return;
    
    try {
      const { doc, deleteDoc } = await import('firebase/firestore');
      const bookingRef = doc(db, 'tickets', selectedBookingId);
      await deleteDoc(bookingRef);
      
      // Refresh local state
      setBookings(prev => prev.filter(b => b.id !== selectedBookingId));
      
      setShowCancelConfirm(false);
      setShowRefundMessage(true);
    } catch (error) {
      console.error("Error cancelling booking:", error);
      alert("Failed to cancel booking. Please try again.");
    }
  };

  const handleCancel = async (bookingId: string) => {
    handleCancelClick(bookingId);
  };

  if (!auth.currentUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-brand-primary/5">
        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm">
          <User size={32} className="text-brand-primary/20" />
        </div>
        <h2 className="text-xl font-black text-brand-secondary mb-2">User Information Missing</h2>
        <p className="text-brand-primary/40 text-center mb-8 font-bold uppercase tracking-widest text-[10px]">user information should be entered first by clicking on user info.</p>
        <button 
          onClick={() => navigate('/')}
          className="w-full py-4 bg-brand-primary text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-lg shadow-brand-primary/20"
        >
          Go to Home
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-brand-primary/5 pb-32"
    >
      {/* Header */}
      <div className="app-header-gradient pt-12 pb-12 px-6 rounded-b-[40px] relative overflow-hidden">
        <div className="absolute top-[-20px] right-[-20px] w-32 h-32 bg-white/10 rounded-full blur-2xl" />
        
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-2xl border-2 border-white/20 overflow-hidden">
            <img src={auth.currentUser.photoURL || ''} alt="Profile" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-black text-white">Your Booking</h1>
            <p className="text-white/60 text-xs font-bold">{auth.currentUser.displayName} • {auth.currentUser.email}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center text-white"
          >
            <LogOut size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
            <p className="text-white/50 text-[8px] font-black uppercase tracking-widest mb-1">Total Bookings</p>
            <p className="text-white font-black text-xl">{bookings.length}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
            <p className="text-white/50 text-[8px] font-black uppercase tracking-widest mb-1">Member Since</p>
            <p className="text-white font-black text-xl">2026</p>
          </div>
        </div>
      </div>

      {/* Bookings Section */}
      <div className="px-6 -mt-6">
        <div className="bg-white p-6 rounded-[32px] shadow-xl shadow-brand-primary/10 border border-brand-primary/5 min-h-[400px]">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-lg font-black text-brand-secondary uppercase tracking-widest">Your Bookings</h2>
            <Ticket size={20} className="text-brand-primary/20" />
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-brand-primary/5 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : bookings.length > 0 ? (
            <div className="space-y-4">
              {bookings.map((booking) => (
                <div key={booking.id} className="p-5 bg-brand-primary/5 rounded-[24px] border border-brand-primary/10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-brand-primary/10 text-brand-primary rounded-xl flex items-center justify-center">
                        <Ticket size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-brand-secondary">
                          {booking.source && booking.destination 
                            ? `${booking.source} to ${booking.destination}`
                            : (booking.itemDetails.name || booking.itemDetails.provider)}
                        </h3>
                        <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest">{booking.bookingId || 'Confirmed'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-brand-primary">₹{(booking.price || booking.totalCost || 0).toLocaleString()}</p>
                      <p className={`text-[8px] font-bold uppercase tracking-widest ${booking.status === 'cancelled' ? 'text-rose-600' : 'text-brand-primary/40'}`}>
                        {booking.status === 'cancelled' ? 'Cancelled' : 'Paid'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-white rounded-xl border border-brand-primary/10">
                    <div>
                      <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">
                        {(booking.itemDetails.type === 'hotel' || booking.itemDetails.type === 'event') ? 'Start Time' : 'Departure'}
                      </p>
                      <p className="text-[10px] font-black text-brand-secondary">{booking.itemDetails.startTime || '--:--'}</p>
                      <p className="text-[8px] font-bold text-brand-primary/40">{booking.itemDetails.startDate || 'TBD'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">
                        {(booking.itemDetails.type === 'hotel' || booking.itemDetails.type === 'event') ? 'End Time' : 'Arrival'}
                      </p>
                      <p className="text-[10px] font-black text-brand-secondary">{booking.itemDetails.endTime || '--:--'}</p>
                      <p className="text-[8px] font-bold text-brand-primary/40">{booking.itemDetails.endDate || 'TBD'}</p>
                    </div>
                  </div>

                  {booking.passengerInfo && (
                    <div className="mb-4 p-3 bg-brand-primary/10 rounded-xl border border-brand-primary/20">
                      <p className="text-[8px] font-black text-brand-primary uppercase tracking-widest mb-2">Passenger Details</p>
                      <div className="grid grid-cols-2 gap-y-2">
                        <div className="flex items-center gap-1.5">
                          <User size={10} className="text-brand-primary" />
                          <span className="text-[9px] font-bold text-brand-secondary">{booking.passengerInfo.name} ({booking.passengerInfo.age})</span>
                        </div>
                        <div className="flex items-center gap-1.5 justify-end">
                          <Phone size={10} className="text-brand-primary" />
                          <span className="text-[9px] font-bold text-brand-secondary">{booking.passengerInfo.phone}</span>
                        </div>
                        <div className="flex items-center gap-1.5 col-span-2">
                          <Mail size={10} className="text-brand-primary" />
                          <span className="text-[9px] font-bold text-brand-secondary">{booking.passengerInfo.email}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-brand-primary/10">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 text-[9px] font-bold text-brand-primary/40">
                        <Clock size={10} />
                        <span>{booking.itemDetails.duration}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[9px] font-bold text-brand-primary/40">
                        <Tag size={10} />
                        <span className="capitalize">{booking.itemDetails.type}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleCancel(booking.id)}
                      disabled={booking.status === 'cancelled'}
                      className={`text-[9px] font-black uppercase tracking-widest ${booking.status === 'cancelled' ? 'text-brand-primary/20 cursor-not-allowed' : 'text-rose-600'}`}
                    >
                      {booking.status === 'cancelled' ? 'Cancelled' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-brand-primary/5 rounded-full flex items-center justify-center mb-4">
                <Ticket size={24} className="text-brand-primary/20" />
              </div>
              <p className="text-xs font-bold text-brand-primary/40 uppercase tracking-widest">No bookings yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Cancellation Confirmation Modal */}
      <AnimatePresence>
        {showCancelConfirm && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle size={32} />
              </div>
              <h2 className="text-2xl font-black text-brand-secondary mb-2 text-center">Cancel Booking?</h2>
              <p className="text-slate-500 mb-8 text-sm text-center">Are you sure you want to cancel this booking? This action cannot be undone.</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 font-black text-[10px] uppercase tracking-widest rounded-2xl"
                >
                  No, Keep it
                </button>
                <button 
                  onClick={confirmCancel}
                  className="flex-1 py-4 bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-lg shadow-rose-100"
                >
                  Yes, Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Refund Message Modal */}
      <AnimatePresence>
        {showRefundMessage && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={32} />
              </div>
              <h2 className="text-2xl font-black text-brand-secondary mb-2 text-center">Booking Cancelled</h2>
              <p className="text-slate-500 mb-8 text-sm text-center">
                Your booking money will be in your bank within 24 hrs if not contact customer support.
              </p>
              
              <button 
                onClick={() => setShowRefundMessage(false)}
                className="w-full py-4 bg-brand-primary text-white font-black text-[10px] uppercase tracking-widest rounded-2xl"
              >
                Okay
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
