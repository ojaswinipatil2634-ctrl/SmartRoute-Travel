import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Camera, ExternalLink } from 'lucide-react';
import { fetchPlaceImages, UnsplashImage } from '../services/unsplashService';

interface DestinationGalleryProps {
  placeName: string;
}

export default function DestinationGallery({ placeName }: DestinationGalleryProps) {
  const [images, setImages] = useState<UnsplashImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadImages() {
      setLoading(true);
      const fetchedImages = await fetchPlaceImages(placeName);
      setImages(fetchedImages);
      setLoading(false);
    }
    loadImages();
  }, [placeName]);

  const next = () => setCurrentIndex((prev) => (prev + 1) % images.length);
  const prev = () => setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);

  if (loading) {
    return (
      <div className="w-full h-64 bg-brand-primary/5 rounded-[32px] animate-pulse flex items-center justify-center">
        <Camera className="text-brand-primary/20 animate-bounce" size={32} />
      </div>
    );
  }

  if (images.length === 0) return null;

  return (
    <div className="relative group overflow-hidden rounded-[32px] shadow-xl border border-brand-primary/10">
      <div className="aspect-[16/9] w-full relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.img
            key={images[currentIndex].id}
            src={images[currentIndex].url}
            alt={images[currentIndex].alt}
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.5 }}
            className="w-full h-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </AnimatePresence>
        
        {/* Overlay Info */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-white/60 text-[8px] font-black uppercase tracking-widest mb-1">Authentic View</p>
              <h3 className="text-white text-lg font-black leading-tight">{placeName}</h3>
            </div>
            <a 
              href={images[currentIndex].photographerUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-white/60 hover:text-white transition-colors text-[9px] font-bold"
            >
              <Camera size={10} />
              {images[currentIndex].photographer}
              <ExternalLink size={8} />
            </a>
          </div>
        </div>

        {/* Navigation */}
        {images.length > 1 && (
          <>
            <button 
              onClick={prev}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/40"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={next}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/40"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        {/* Indicators */}
        <div className="absolute top-4 right-4 flex gap-1.5">
          {images.map((_, idx) => (
            <div 
              key={idx}
              className={`h-1 rounded-full transition-all ${idx === currentIndex ? 'w-4 bg-white' : 'w-1 bg-white/40'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
