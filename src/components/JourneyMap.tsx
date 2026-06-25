import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { JourneyOption } from '../lib/mistral';

// Fix for default marker icons in Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface JourneyMapProps {
  selectedJourney: JourneyOption | null;
}

function ChangeView({ center, bounds }: { center: [number, number], bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else {
      map.setView(center, 12);
    }
  }, [center, bounds, map]);
  return null;
}

export default function JourneyMap({ selectedJourney }: JourneyMapProps) {
  const allCoords = selectedJourney?.steps.flatMap(step => step.coordinates) || [];
  const center: [number, number] = allCoords.length > 0 ? allCoords[0] : [20.5937, 78.9629]; // Default to center of India
  
  const bounds = allCoords.length > 1 ? L.latLngBounds(allCoords as L.LatLngExpression[]) : null;

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'flight': return '#ef4444'; // Red
      case 'train': return '#3b82f6'; // Blue
      case 'bus': return '#10b981'; // Green
      case 'cab': return '#f59e0b'; // Amber
      default: return '#6366f1'; // Indigo
    }
  };

  return (
    <div className="w-full h-[300px] rounded-[32px] overflow-hidden border border-brand-primary/10 shadow-inner relative z-0">
      <MapContainer 
        center={center} 
        zoom={12} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ChangeView center={center} bounds={bounds} />
        
        {selectedJourney?.steps.map((step, idx) => (
          <React.Fragment key={idx}>
            <Polyline 
              positions={step.coordinates} 
              pathOptions={{ 
                color: getModeColor(step.mode), 
                weight: 5, 
                opacity: 0.8,
                dashArray: step.mode === 'walking' ? '5, 10' : undefined
              }} 
            />
            {/* Start Marker */}
            {idx === 0 && (
              <Marker position={step.coordinates[0]}>
                <Popup>
                  <div className="text-[10px] font-black uppercase tracking-widest">
                    Start: {typeof step.from === 'object' ? (step.from as any).name : step.from}
                  </div>
                </Popup>
              </Marker>
            )}
            {/* End Marker */}
            {idx === selectedJourney.steps.length - 1 && (
              <Marker position={step.coordinates[step.coordinates.length - 1]}>
                <Popup>
                  <div className="text-[10px] font-black uppercase tracking-widest">
                    Destination: {typeof step.to === 'object' ? (step.to as any).name : step.to}
                  </div>
                </Popup>
              </Marker>
            )}
            {/* Transition Markers */}
            {idx < selectedJourney.steps.length - 1 && (
              <Marker position={step.coordinates[step.coordinates.length - 1]}>
                <Popup>
                  <div className="text-[10px] font-black uppercase tracking-widest">
                    Transfer: {typeof step.to === 'object' ? (step.to as any).name : step.to}
                  </div>
                </Popup>
              </Marker>
            )}
          </React.Fragment>
        ))}
      </MapContainer>
      
      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-brand-primary/10 z-[1000] flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-[#ef4444] rounded-full" />
          <span className="text-[8px] font-black text-brand-secondary uppercase tracking-widest">Flight</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-[#3b82f6] rounded-full" />
          <span className="text-[8px] font-black text-brand-secondary uppercase tracking-widest">Train</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-[#10b981] rounded-full" />
          <span className="text-[8px] font-black text-brand-secondary uppercase tracking-widest">Bus</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-[#f59e0b] rounded-full" />
          <span className="text-[8px] font-black text-brand-secondary uppercase tracking-widest">Cab</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-[#6366f1] border-t border-dashed border-white rounded-full" />
          <span className="text-[8px] font-black text-brand-secondary uppercase tracking-widest">Walking</span>
        </div>
      </div>
    </div>
  );
}
