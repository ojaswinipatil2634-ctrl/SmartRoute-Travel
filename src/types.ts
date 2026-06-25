export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: string;
  fcmToken?: string;
}

export interface TripItem {
  type: 'flight' | 'train' | 'cab' | 'hotel' | 'restaurant' | 'event';
  name: string;
  price: number;
  details?: string;
  id: string;
}

export interface Trip {
  id?: string;
  userId: string;
  title: string;
  source: string;
  destination: string;
  startDate: string;
  endDate: string;
  totalCost: number;
  items: TripItem[];
  createdAt: string;
}

export interface Booking {
  id?: string;
  userId: string;
  itemDetails: any;
  price: number;
  status: 'confirmed' | 'pending' | 'cancelled';
  timestamp: string;
}

export interface ChatMessage {
  id?: string;
  userId: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export interface SavedItem {
  id?: string;
  userId: string;
  itemId: string;
  itemType: string;
  data: any;
  savedAt: string;
}

export interface SearchResult {
  id: string;
  provider?: string;
  name?: string;
  price: number;
  duration?: string;
  rating?: number;
  type: string;
  image?: string;
  classification?: 'cheapest' | 'fastest' | 'smartest' | 'comfortable';
  ecoScore?: 'Eco Friendly' | 'Moderate' | 'Not Eco Friendly';
  carbonEmission?: number;
  arrivalTime?: string;
  surgeApplied?: boolean;
  capacity?: number;
  startTime?: string;
  endTime?: string;
  startDate?: string;
  endDate?: string;
  // Hotel specific
  entryTime?: string;
  exitTime?: string;
  // Restaurant/Event specific
  bookingDate?: string;
  timeSlot?: string;
  popularity?: number;
  distanceFromCenter?: string;
  url?: string;
}

export interface RouteStep {
  mode: string;
  provider: string;
  startTime: string;
  endTime: string;
  date: string;
  detail: string;
  cost: number;
}

export interface RouteOption {
  distance: string;
  time: string;
  mode: string;
  cost: number;
  classification: 'cheapest' | 'fastest' | 'smartest' | 'comfortable' | 'shortest';
  ecoScore?: 'Eco Friendly' | 'Moderate' | 'Not Eco Friendly';
  carbonEmission?: number;
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string;
  steps: RouteStep[];
  options: SearchResult[];
}

export interface RouteResults {
  shortest: RouteOption;
  cheapest: RouteOption;
  fastest: RouteOption;
  smartest: RouteOption;
  comfortable: RouteOption;
}
