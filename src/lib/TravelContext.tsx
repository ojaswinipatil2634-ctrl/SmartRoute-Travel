import React, { createContext, useContext, useState, useEffect } from 'react';

interface SelectedProviders {
  flight: string | null;
  bus: string | null;
  train: string | null;
  cab: string | null;
}

interface TravelContextType {
  from: string;
  setFrom: (val: string) => void;
  to: string;
  setTo: (val: string) => void;
  date: string;
  setDate: (val: string) => void;
  time: string;
  setTime: (val: string) => void;
  selectedProviders: SelectedProviders;
  setSelectedProviders: React.Dispatch<React.SetStateAction<SelectedProviders>>;
}

const TravelContext = createContext<TravelContextType | undefined>(undefined);

export function TravelProvider({ children }: { children: React.ReactNode }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [selectedProviders, setSelectedProviders] = useState<SelectedProviders>({
    flight: null,
    bus: null,
    train: null,
    cab: null
  });

  // Log for debugging
  useEffect(() => {
    console.log('[TravelContext] State Updated:', { from, to, date, time, selectedProviders });
  }, [from, to, date, time, selectedProviders]);

  return (
    <TravelContext.Provider value={{ 
      from, setFrom, to, setTo, date, setDate, time, setTime, 
      selectedProviders, setSelectedProviders 
    }}>
      {children}
    </TravelContext.Provider>
  );
}

export function useTravel() {
  const context = useContext(TravelContext);
  if (context === undefined) {
    throw new Error('useTravel must be used within a TravelProvider');
  }
  return context;
}
