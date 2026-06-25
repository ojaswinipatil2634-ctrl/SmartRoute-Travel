import React, { useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Download, Share2, MapPin, Calendar, Clock, User, 
  Plane, Train, Car, Hotel, Ticket as TicketIcon, 
  QrCode, ShieldCheck, ChevronRight, Info
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { generatePDF } from '../../lib/pdfUtils';

interface TicketProps {
  booking: {
    bookingId: string;
    bookingType: string;
    user?: {
      name: string;
      email: string;
      phone: string;
    };
    details: any;
    totalCost?: number;
    price?: number;
    createdAt: string;
    status: string;
  };
  onClose: () => void;
}

export default function TicketGenerator({ booking, onClose }: TicketProps) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const { details, bookingId, bookingType } = booking;

  const getIcon = () => {
    switch (bookingType) {
      case 'flight': return <Plane size={24} />;
      case 'train': return <Train size={24} />;
      case 'cab': return <Car size={24} />;
      case 'hotel': return <Hotel size={24} />;
      default: return <TicketIcon size={24} />;
    }
  };

  const handleDownload = () => {
    generatePDF('e-ticket-container', `TripSutra_Ticket_${bookingId}`);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-md my-8">
        {/* Actions */}
        <div className="flex justify-between items-center mb-6 px-2">
          <div className="flex items-center gap-2 bg-emerald-500/20 backdrop-blur-md px-4 py-2 rounded-2xl border border-emerald-500/30">
            <ShieldCheck size={18} className="text-emerald-400" />
            <span className="text-white text-[10px] font-black uppercase tracking-widest">Confirmed Successfully</span>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white hover:bg-white/20 transition-all">
              <Download size={20} />
            </button>
            <button onClick={onClose} className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white hover:bg-white/20 transition-all">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Ticket Container */}
        <div id="e-ticket-container" className="bg-white rounded-[40px] overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="app-header-gradient p-8 text-white">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h1 className="text-2xl font-black tracking-tighter">TripSutra</h1>
                <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Official E-Ticket</p>
              </div>
              <div className="px-4 py-2 bg-white/20 rounded-xl backdrop-blur-md">
                <p className="text-[10px] font-black uppercase tracking-widest">#{bookingId}</p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center backdrop-blur-md border border-white/10">
                {getIcon()}
              </div>
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Service Provider</p>
                <h2 className="text-2xl font-black">{details.provider || details.eventName || 'SmartRoute Service'}</h2>
                <div className="flex items-center gap-2 text-white/60 mt-1">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Confirmed & Verified</span>
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-8 space-y-8">
            {/* Main Info */}
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Passenger</p>
                <p className="text-sm font-black text-brand-secondary">{booking.user?.name || details.passengerName}</p>
                <p className="text-[9px] font-bold text-slate-400">{booking.user?.email || details.email} • {booking.user?.phone || details.phone}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {(bookingType === 'hotel' || bookingType === 'event') ? 'Start Date' : 'Journey Date'}
                </p>
                <p className="text-sm font-black text-brand-secondary">{details.date || details.startDate}</p>
                <p className="text-[9px] font-bold text-slate-400">Status: {booking.status.toUpperCase()}</p>
              </div>
            </div>

            {/* Time Info - Always show for all tickets */}
            <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-100">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {(bookingType === 'hotel' || bookingType === 'event') ? 'Start Time' : 'Departure Time'}
                </p>
                <p className="text-xs font-bold text-brand-secondary">
                  {details.startTime || '09:00 AM'}
                </p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {(bookingType === 'hotel' || bookingType === 'event') ? 'End Time' : 'Arrival Time'}
                </p>
                <p className="text-xs font-bold text-brand-secondary">
                  {details.endTime || '05:00 PM'}
                </p>
              </div>
            </div>

            {/* Route Info */}
            {(details.from || details.to) && (
              <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">From</p>
                    <p className="text-xs font-black text-brand-secondary">{details.from || 'N/A'}</p>
                  </div>
                  <div className="flex flex-col items-center px-4">
                    <div className="w-12 h-px bg-slate-300 relative">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-brand-primary rounded-full" />
                    </div>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">To</p>
                    <p className="text-xs font-black text-brand-secondary">{details.to || 'N/A'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Specific Details */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {bookingType === 'hotel' ? 'Room Type' : (bookingType === 'flight' ? 'Class' : (bookingType === 'train' ? 'Coach' : 'Type'))}
                </p>
                <p className="text-xs font-bold text-brand-secondary">
                  {details.roomType || details.class || details.cabType || details.seatType || 'Standard'}
                </p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {bookingType === 'hotel' ? 'Breakfast' : (bookingType === 'flight' ? 'Seat' : (bookingType === 'train' ? 'Berth' : 'Tickets'))}
                </p>
                <p className="text-xs font-bold text-brand-secondary">
                  {bookingType === 'hotel' ? (details.breakfastIncluded ? 'Included' : 'Not Included') : (details.seatPreference || details.berthPreference || details.tickets || '1')}
                </p>
              </div>
            </div>

            {bookingType === 'cab' && details.pickupTime && (
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pickup Time</p>
                <p className="text-xs font-bold text-brand-secondary">{details.pickupTime}</p>
              </div>
            )}

            {bookingType === 'event' && details.venue && (
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Venue</p>
                <p className="text-xs font-bold text-brand-secondary">{details.venue}</p>
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount Paid</p>
              <p className="text-sm font-black text-brand-primary">₹{(booking.totalCost || booking.price || 0).toLocaleString()}</p>
            </div>

            {/* QR Section */}
            <div className="flex items-center gap-8 pt-8 border-t border-dashed border-slate-200">
              <div className="p-3 bg-white border-2 border-slate-50 rounded-3xl shadow-sm">
                <QRCode 
                  value={JSON.stringify({ id: bookingId, type: bookingType, user: details.passengerName })} 
                  size={80}
                  level="H"
                />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <QrCode size={14} className="text-brand-primary" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-secondary">Digital Pass</p>
                </div>
                <p className="text-[10px] font-medium text-slate-400 leading-relaxed">
                  Scan this QR code at the entry point or check-in counter for instant verification.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 p-6 flex items-center gap-4">
            <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm">
              <Info size={18} className="text-slate-400" />
            </div>
            <p className="text-[9px] font-bold text-slate-400 leading-relaxed">
              This is a computer-generated e-ticket. No physical signature is required. Please carry a valid ID proof during travel.
            </p>
          </div>
        </div>

        {/* Support */}
        <p className="text-center text-white/40 text-[10px] font-bold uppercase tracking-widest mt-8">
          Need Help? Contact support@tripsutra.travel
        </p>
      </div>
    </div>
  );
}
