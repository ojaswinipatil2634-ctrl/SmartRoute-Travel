import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { CheckCircle2, ChevronRight, ShieldCheck, Calendar, Clock, MapPin, CreditCard, Ticket } from 'lucide-react';

import { parseFirestoreData } from '../lib/utils';

export default function Success() {
  const location = useLocation();
  const navigate = useNavigate();
  const rawBooking = location.state;
  const booking = parseFirestoreData(rawBooking);

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <Ticket size={40} />
          </div>
          <h3 className="text-xl font-black text-brand-secondary">No booking data found</h3>
          <p className="text-xs font-medium text-slate-400">It seems you reached this page without a confirmed booking.</p>
          <Link 
            to="/"
            className="inline-block px-8 py-4 bg-brand-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const isMultiModal = booking.bookingType === 'multi-modal';
  const details = booking.details || {};

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-slate-50 pb-32"
    >
      <div className="app-header-gradient pt-12 pb-24 px-6 rounded-b-[40px] text-center text-white">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", damping: 12 }}
          className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-[32px] flex items-center justify-center mx-auto mb-6 shadow-xl"
        >
          <CheckCircle2 size={40} className="text-emerald-400" />
        </motion.div>
        <h1 className="text-3xl font-black mb-2">Booking Confirmed!</h1>
        <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Booking ID: {booking.bookingId}</p>
      </div>

      <div className="px-6 -mt-12">
        <div className="bg-white rounded-[40px] p-8 shadow-xl shadow-slate-200 border border-slate-100 space-y-8">
          {/* Summary Card */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-brand-secondary uppercase tracking-widest">Journey Summary</h3>
              <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                <ShieldCheck size={12} />
                <span className="text-[10px] font-black uppercase tracking-widest">Verified</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-3xl border border-slate-100">
                <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center">
                  <MapPin size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Service</p>
                  <p className="text-xs font-black text-brand-secondary capitalize">
                    {isMultiModal ? 'Smart Travel Journey' : (details.provider || booking.bookingType)}
                  </p>
                </div>
              </div>

              {!isMultiModal && (
                <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-3xl border border-slate-100">
                        <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
                          <Calendar size={18} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {(booking.bookingType === 'hotel' || booking.bookingType === 'event') ? 'Start Date' : 'Journey Date'}
                          </p>
                          <p className="text-xs font-black text-brand-secondary">{details.date || details.startDate || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-3xl border border-slate-100">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                          <Clock size={18} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {(booking.bookingType === 'hotel' || booking.bookingType === 'event') ? 'End Time' : 'Arrival Time'}
                          </p>
                          <p className="text-xs font-black text-brand-secondary">
                            {details.endTime || details.returnDate || details.endDate || details.arrivalTime || 'TBD'}
                          </p>
                        </div>
                      </div>
                    </div>
                  
                  {details.from && details.to && (
                    <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-3xl border border-slate-100">
                      <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center">
                        <MapPin size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Route</p>
                        <p className="text-xs font-black text-brand-secondary">{details.from} → {details.to}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-4 p-4 bg-brand-primary/5 rounded-3xl border border-brand-primary/10">
                <div className="w-12 h-12 bg-brand-primary text-white rounded-2xl flex items-center justify-center">
                  <CreditCard size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount Paid</p>
                  <p className="text-lg font-black text-brand-primary">₹{(booking.totalCost || booking.price || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Passenger Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-brand-secondary uppercase tracking-widest">Passenger Details</h3>
            <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</span>
                <span className="text-xs font-black text-brand-secondary">{booking.passengerName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</span>
                <span className="text-xs font-black text-brand-secondary">{booking.email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phone</span>
                <span className="text-xs font-black text-brand-secondary">{booking.phone}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <button 
              onClick={() => navigate('/profile')}
              className="w-full h-16 bg-brand-secondary text-white rounded-3xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
            >
              View My Tickets <ChevronRight size={18} />
            </button>
            <Link 
              to="/"
              className="w-full h-16 bg-slate-100 text-slate-600 rounded-3xl font-black text-xs uppercase tracking-widest flex items-center justify-center hover:bg-slate-200 transition-all"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
