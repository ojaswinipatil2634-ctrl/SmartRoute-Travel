import React, { useState, useEffect } from 'react';
import { fetchPlaceImages } from '../services/unsplashService';
import { Loader2, ImageOff } from 'lucide-react';

interface PlaceImageProps {
  placeName: string;
  className?: string;
  fallbackSeed?: string;
}

export default function PlaceImage({ placeName, className = "", fallbackSeed }: PlaceImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadImage = async () => {
      setLoading(true);
      setError(false);
      try {
        const images = await fetchPlaceImages(placeName);
        if (isMounted) {
          if (images && images.length > 0) {
            setImageUrl(images[0].url);
          } else {
            // Fallback to picsum if no relevant unsplash images found
            setImageUrl(`https://picsum.photos/seed/${fallbackSeed || placeName.toLowerCase().replace(/\s+/g, '')}/800/600`);
          }
        }
      } catch (err) {
        console.error(`Failed to load image for ${placeName}:`, err);
        if (isMounted) {
          setError(true);
          setImageUrl(`https://picsum.photos/seed/${fallbackSeed || placeName.toLowerCase().replace(/\s+/g, '')}/800/600`);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadImage();
    return () => { isMounted = false; };
  }, [placeName, fallbackSeed]);

  return (
    <div className={`relative overflow-hidden bg-brand-primary/5 ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-primary/5">
          <Loader2 className="w-5 h-5 text-brand-primary/20 animate-spin" />
        </div>
      )}
      
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={placeName}
          className={`w-full h-full object-cover transition-opacity duration-500 ${loading ? 'opacity-0' : 'opacity-100'}`}
          referrerPolicy="no-referrer"
          onLoad={() => setLoading(false)}
        />
      ) : !loading && error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-brand-primary/20 p-4 text-center">
          <ImageOff size={24} className="mb-2" />
          <span className="text-[8px] font-bold uppercase tracking-widest">Image Load Failed</span>
        </div>
      ) : null}
    </div>
  );
}
