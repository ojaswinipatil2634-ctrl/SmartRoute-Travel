import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Wallet, Clock, MapPin, TrendingUp, Calendar, ChevronRight, CheckCircle2, X, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { parseFirestoreData } from '../lib/utils';
import { Trip, Booking } from '../types';

export default function Dashboard() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!auth.currentUser) return;
      setLoading(true);
      try {
        const tripsQ = query(collection(db, 'trips'), where('userId', '==', auth.currentUser.uid));
        const ticketsQ = query(collection(db, 'tickets'), where('userId', '==', auth.currentUser.uid), orderBy('createdAt', 'desc'));
        
        const [tripsSnap, ticketsSnap] = await Promise.all([
          getDocs(tripsQ).catch(err => {
            handleFirestoreError(err, 'list', 'trips');
            throw err;
          }),
          getDocs(ticketsQ).catch(err => {
            handleFirestoreError(err, 'list', 'tickets');
            throw err;
          })
        ]);

        setTrips(tripsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip)));
        
        const ticketsData = ticketsSnap.docs.map(doc => {
          const data = parseFirestoreData(doc.data());
          return {
            id: doc.id,
            ...data,
            // Map to Booking structure for UI compatibility
            itemDetails: {
              name: data.service,
              provider: data.service,
              type: data.type,
              duration: data.duration || 'TBD',
              arrivalTime: data.arrivalTime || '--:--'
            },
            timestamp: data.createdAt?.toDate?.() || new Date()
          } as any;
        });
        setBookings(ticketsData);
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
      } finally {
        setLoading(false);
      }
    };

    function handleFirestoreError(error: any, operationType: string, path: string) {
      const errInfo = {
        error: error.message || String(error),
        operationType,
        path,
        authInfo: {
          userId: auth.currentUser?.uid,
          email: auth.currentUser?.email,
          emailVerified: auth.currentUser?.emailVerified,
          isAnonymous: auth.currentUser?.isAnonymous,
        }
      };
      console.error('Firestore Error:', JSON.stringify(errInfo));
    }
    fetchData();
  }, [auth.currentUser]);

  const [selectedBooking, setSelectedBooking] = useState<any>(null);

  const stats = [
    { label: 'Total Spent', value: `₹${bookings.reduce((acc, b) => acc + (b.price || 0), 0).toLocaleString()}`, icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Bookings', value: bookings.length.toString(), icon: CheckCircle2, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Destinations', value: trips.length.toString(), icon: MapPin, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Savings', value: '₹4,200', icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  const chartData = [
    { month: 'Jan', cost: 400 },
    { month: 'Feb', cost: 300 },
    { month: 'Mar', cost: 600 },
    { month: 'Apr', cost: 800 },
    { month: 'May', cost: 500 },
    { month: 'Jun', cost: 900 },
  ];

  if (!auth.currentUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-brand-primary/5">
        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm">
          <MapPin size={32} className="text-brand-primary/20" />
        </div>
        <h2 className="text-xl font-black text-brand-secondary mb-2">User Information Missing</h2>
        <p className="text-brand-primary/40 text-center mb-8 font-bold uppercase tracking-widest text-[10px]">user information should be entered first by clicking on user info.</p>
        <button 
          onClick={() => (window.location.href = '/')}
          className="w-full py-4 bg-brand-primary text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-lg shadow-brand-primary/20"
        >
          Go to Home
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-brand-primary/5">
      {/* Header */}
      <div className="app-header-gradient pt-10 pb-16 px-5 rounded-b-[40px] relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-3xl" />
        <div className="relative z-10">
          <h1 className="text-2xl font-black text-white mb-1 font-display">My Trips</h1>
          <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Welcome back, {auth.currentUser?.displayName?.split(' ')[0]}!</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-5 -mt-8 relative z-20 space-y-4 pb-32">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white p-4 rounded-[24px] border border-brand-primary/5 shadow-sm"
            >
              <div className={`w-8 h-8 ${stat.bg} ${stat.color} rounded-xl flex items-center justify-center mb-2`}>
                <stat.icon size={16} />
              </div>
              <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-0.5">{stat.label}</p>
              <p className="text-lg font-black text-brand-secondary">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Recent Bookings */}
        <div className="bg-white p-5 rounded-[32px] border border-brand-primary/5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black text-brand-secondary uppercase tracking-widest">Recent Bookings</h3>
            <button className="text-brand-primary text-[8px] font-black uppercase">View All</button>
          </div>
          <div className="space-y-3">
            {bookings.length > 0 ? bookings.map(booking => (
              <div 
                key={booking.id} 
                onClick={() => setSelectedBooking(booking)}
                className="flex items-center justify-between p-3 bg-brand-primary/5 rounded-xl cursor-pointer hover:bg-brand-primary/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-brand-primary shadow-sm">
                    <CheckCircle2 size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-brand-secondary text-[10px] truncate max-w-[100px]">{booking.itemDetails.name || booking.itemDetails.provider}</p>
                    <p className="text-[8px] text-brand-primary/40 uppercase font-bold">{booking.itemDetails.type}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-brand-secondary text-[10px]">₹{(booking.price || booking.totalCost || 0).toLocaleString()}</p>
                  <div className="flex flex-col items-end">
                    <p className="text-[8px] text-brand-primary/40 font-bold">{new Date(booking.timestamp).toLocaleDateString()}</p>
                    <p className="text-[8px] text-brand-primary font-black uppercase">Arr: {booking.itemDetails.arrivalTime}</p>
                  </div>
                </div>
              </div>
            )) : (
              <div className="text-center py-6 text-brand-primary/20">
                <p className="text-[10px] font-bold uppercase tracking-widest">No bookings yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Savings Card */}
        <div className="bg-brand-secondary text-white p-6 rounded-[32px] relative overflow-hidden">
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-brand-primary/20 rounded-full blur-2xl" />
          <h3 className="text-lg font-black mb-4 font-display">Smart Savings</h3>
          <div className="space-y-3">
            <div className="p-4 bg-white/10 rounded-2xl border border-white/10">
              <p className="text-[8px] text-white/60 uppercase tracking-widest mb-0.5">Monthly Savings</p>
              <p className="text-2xl font-black text-brand-primary">₹1,280</p>
            </div>
            <button className="w-full py-3 bg-brand-primary rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-brand-primary/80 transition-all shadow-lg shadow-brand-primary/20">
              Savings Report
            </button>
          </div>
        </div>
      </div>

      {/* Ticket Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-brand-secondary/60 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[40px] p-8 max-w-md w-full shadow-2xl relative"
          >
            <button 
              onClick={() => setSelectedBooking(null)}
              className="absolute top-6 right-6 w-10 h-10 bg-brand-primary/5 text-brand-primary/40 rounded-full flex items-center justify-center hover:bg-brand-primary/10 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldCheck size={32} />
              </div>
              <h2 className="text-2xl font-black text-brand-secondary mb-1">E-Ticket</h2>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Booking ID: {selectedBooking.bookingId}</p>
            </div>

            <div className="bg-brand-primary/5 p-6 rounded-3xl space-y-4 mb-8">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">
                    {(selectedBooking.bookingType === 'hotel' || selectedBooking.bookingType === 'event') ? 'Start Time' : 'Departure'}
                  </p>
                  <p className="text-xs font-black text-brand-secondary">
                    {selectedBooking.details?.startTime || selectedBooking.details?.pickupTime || selectedBooking.details?.entryTime || selectedBooking.details?.time || selectedBooking.dateTime || '--:--'}
                  </p>
                  <p className="text-[8px] font-bold text-brand-primary/60">{selectedBooking.details?.date || selectedBooking.details?.startDate || new Date(selectedBooking.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">
                    {(selectedBooking.bookingType === 'hotel' || selectedBooking.bookingType === 'event') ? 'End Time' : 'Arrival'}
                  </p>
                  <p className="text-xs font-black text-brand-secondary">
                    {selectedBooking.details?.endTime || selectedBooking.details?.exitTime || selectedBooking.details?.arrivalTime || selectedBooking.arrivalTime || '--:--'}
                  </p>
                  <p className="text-[8px] font-bold text-brand-primary/60">{selectedBooking.details?.endDate || selectedBooking.details?.date || new Date(selectedBooking.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              
              <div className="pt-4 border-t border-brand-primary/20">
                <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">Passenger</p>
                <p className="text-xs font-black text-brand-secondary">{selectedBooking.user?.name || selectedBooking.passengerName}</p>
                <p className="text-[8px] font-bold text-brand-primary/40">{selectedBooking.user?.email || selectedBooking.email}</p>
              </div>

              <div className="pt-4 border-t border-brand-primary/20">
                <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest mb-1">Service Provider</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-brand-secondary">{selectedBooking.provider || selectedBooking.details?.provider || selectedBooking.details?.eventName || selectedBooking.service}</span>
                  <span className="text-[9px] font-black text-brand-primary uppercase">{selectedBooking.bookingType || selectedBooking.type}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-brand-primary/20 flex items-center justify-between">
                <p className="text-[8px] font-black text-brand-primary/40 uppercase tracking-widest">Amount Paid</p>
                <p className="text-sm font-black text-brand-secondary">₹{(selectedBooking.totalCost || selectedBooking.price || 0).toLocaleString()}</p>
              </div>
            </div>

            <button 
              onClick={() => setSelectedBooking(null)}
              className="w-full py-4 bg-brand-primary text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-lg shadow-brand-primary/20"
            >
              Close Ticket
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
