import axios from 'axios';

export interface JourneyStep {
  mode: 'bus' | 'train' | 'cab' | 'flight' | 'walking';
  provider: string;
  from: string;
  to: string;
  time: string;
  duration: string;
  description: string;
  coordinates: [number, number][]; // [lat, lng]
}

export interface JourneyOption {
  id: string;
  timeWindow: string; // e.g., "8 AM - 4 PM"
  departureTime: string;
  arrivalTime: string;
  totalDuration: string;
  totalCost: number;
  modes: string[];
  steps: JourneyStep[];
  isSmartest: boolean;
  smartTag?: string;
  routeId: string; // unique_route_n
  category?: 'best' | 'fastest' | 'cheapest' | 'comfortable' | 'eco-friendly';
}

export interface SelectedProviders {
  flight: string | null;
  bus: string | null;
  train: string | null;
  cab: string | null;
}

export async function generateJourneyBreakdown(
  from: string, 
  to: string, 
  preferredTime: string,
  selectedProviders: SelectedProviders = { flight: null, bus: null, train: null, cab: null }
): Promise<JourneyOption[]> {
  try {
    const response = await axios.post('/api/ai/journey', {
      from,
      to,
      preferredTime,
      selectedProviders
    });

    return response.data.journey_options;
  } catch (e: any) {
    console.error("Mistral Journey generation failed:", e);
    if (e.response?.data?.error) {
      throw new Error(e.response.data.error);
    }
    throw e;
  }
}

export function getMockSmartJourneys(from: string, to: string, selectedProviders: SelectedProviders): JourneyOption[] {
  return [
    {
      id: "mock_1",
      timeWindow: "6 AM - 2 PM",
      departureTime: "08:30 AM",
      arrivalTime: "02:45 PM",
      totalDuration: "6h 15m",
      totalCost: 4500,
      modes: ['flight', 'cab'],
      isSmartest: true,
      smartTag: "FASTEST",
      routeId: "mock_route_1",
      steps: [
        {
          mode: 'flight',
          provider: selectedProviders.flight || "IndiGo",
          from: from,
          to: "Airport",
          time: "08:30 AM",
          duration: "2h 15m",
          description: "Direct flight to destination airport",
          coordinates: [[19.076, 72.877], [18.520, 73.856]]
        },
        {
          mode: 'cab',
          provider: selectedProviders.cab || "Uber",
          from: "Airport",
          to: to,
          time: "11:30 AM",
          duration: "45m",
          description: "Last mile connectivity to city center",
          coordinates: [[18.520, 73.856], [18.525, 73.860]]
        }
      ]
    },
    {
      id: "mock_2",
      timeWindow: "12 PM - 8 PM",
      departureTime: "01:15 PM",
      arrivalTime: "09:30 PM",
      totalDuration: "8h 15m",
      totalCost: 1200,
      modes: ['train', 'bus'],
      isSmartest: false,
      routeId: "mock_route_2",
      steps: [
        {
          mode: 'train',
          provider: selectedProviders.train || "Shatabdi Express",
          from: from,
          to: "Station",
          time: "01:15 PM",
          duration: "4h 30m",
          description: "Superfast train journey",
          coordinates: [[19.076, 72.877], [18.520, 73.856]]
        },
        {
          mode: 'bus',
          provider: selectedProviders.bus || "Shivneri",
          from: "Station",
          to: to,
          time: "06:30 PM",
          duration: "2h 30m",
          description: "Intercity bus connection",
          coordinates: [[18.520, 73.856], [18.525, 73.860]]
        }
      ]
    }
  ];
}
