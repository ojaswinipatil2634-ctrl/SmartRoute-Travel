import React, { useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Download, Share2, MapPin, Calendar, Clock, User, 
  Plane, Train, Car, Hotel, Ticket as TicketIcon, 
  QrCode, ShieldCheck, ChevronRight, Info, Navigation
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { generatePDF } from '../../lib/pdfUtils';

interface JourneyTicketProps {
  journey: {
    id: string;
    from: string;
    to: string;
    distance: string;
    time: string;
    cost: number;
    steps: any[];
    startDate: string;
    passengerName?: string;
    email?: string;
    phone?: string;
  };
  onClose: () => void;
}

export default function JourneyTicket({ journey, onClose }: JourneyTicketProps) {
  const ticketRef = useRef<HTMLDivElement>(null);

  const getStepIcon = (mode: string) => {
    switch (mode.toLowerCase()) {
      case 'flight': return <Plane size={14} />;
      case 'train': return <Train size={14} />;
      case 'cab': return <Car size={14} />;
      case 'bus': return <Navigation size={14} />;
      default: return <TicketIcon size={14} />;
    }
  };

  const handleDownload = () => {
    generatePDF('journey-ticket-container', `TripSutra_Journey_${journey.id}`);
  };

  return (
    <div className="bg-white rounded-[40px] overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="app-header-gradient p-6 text-white">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-xl font-black tracking-tighter">TripSutra</h1>
            <p className="text-white/60 text-[8px] font-black uppercase tracking-[0.2em] mt-0.5">E-Ticket</p>
          </div>
          <div className="px-3 py-1.5 bg-white/20 rounded-xl backdrop-blur-md">
            <p className="text-[8px] font-black uppercase tracking-widest">#{journey.id}</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-[8px] font-black text-white/60 uppercase tracking-widest">Journey</p>
            <h2 className="text-sm font-black leading-tight">{journey.from} → {journey.to}</h2>
          </div>
          <div className="text-right">
            <p className="text-[8px] font-black text-white/60 uppercase tracking-widest">Cost</p>
            <p className="text-lg font-black">₹{journey.cost?.toLocaleString() || '0'}</p>
          </div>
        </div>

        {journey.passengerName && (
          <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
                <User size={12} />
              </div>
              <div>
                <p className="text-[7px] font-black text-white/60 uppercase tracking-widest">Passenger</p>
                <p className="text-[9px] font-bold">{journey.passengerName}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[7px] font-black text-white/60 uppercase tracking-widest">Contact</p>
              <p className="text-[9px] font-bold">{journey.phone}</p>
            </div>
          </div>
        )}
      </div>

      {/* Timeline Body */}
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-4 bg-brand-primary rounded-full" />
          <h3 className="text-[10px] font-black text-brand-secondary uppercase tracking-wider">Timeline</h3>
        </div>

        <div className="space-y-0 relative">
          {/* Vertical Line */}
          <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-slate-100" />

          {journey.steps.map((step, idx) => (
            <div key={idx} className="relative pl-10 pb-6 last:pb-0">
              {/* Step Dot */}
              <div className="absolute left-0 top-0.5 w-8 h-8 bg-white border-2 border-slate-100 rounded-xl flex items-center justify-center z-10 shadow-sm">
                <div className="text-brand-primary">
                  {getStepIcon(step.mode)}
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-[8px] font-black text-brand-primary uppercase tracking-widest mb-0.5">{step.mode}</p>
                    <h4 className="text-[10px] font-black text-brand-secondary leading-tight">{step.provider || step.name || 'Service Provider'}</h4>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-brand-secondary">{step.startTime} - {step.endTime || step.arrivalTime || 'N/A'}</p>
                  </div>
                </div>
                <p className="text-[9px] font-medium text-slate-500 leading-tight">
                  {step.detail || step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* QR Section */}
        <div className="flex items-center gap-6 pt-6 border-t border-dashed border-slate-200">
          <div className="p-2 bg-white border-2 border-slate-50 rounded-2xl shadow-sm">
            <QRCode 
              value={JSON.stringify({ id: journey.id, type: 'journey', steps: journey.steps.length })} 
              size={60}
              level="H"
            />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-1.5">
              <QrCode size={12} className="text-brand-primary" />
              <p className="text-[9px] font-black uppercase tracking-widest text-brand-secondary">Universal Pass</p>
            </div>
            <p className="text-[8px] font-medium text-slate-400 leading-tight">
              Universal QR code for all segments.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-slate-50 p-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-sm">
          <ShieldCheck size={16} className="text-emerald-500" />
        </div>
        <p className="text-[8px] font-bold text-slate-400 leading-tight">
          Verified. Distance: {journey.distance}. Duration: {journey.time}.
        </p>
      </div>
    </div>
  );
}
