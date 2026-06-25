import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import dotenv from "dotenv";
import polyline from "@mapbox/polyline";
import sgMail from "@sendgrid/mail";
import { aiManager } from "./src/lib/aiManager.js";

dotenv.config();

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Request Logger ---
  app.use((req, res, next) => {
    if (req.url.startsWith('/api/')) {
      console.log(`[API REQUEST] ${req.method} ${req.url}`);
    }
    next();
  });

  // --- API Configuration ---
  const API_KEYS = {
    GEOAPIFY: process.env.GEOAPIFY_API_KEY,
    OPENROUTESERVICE: process.env.OPENROUTESERVICE_API_KEY,
    AVIATIONSTACK: process.env.AVIATIONSTACK_API_KEY,
    TICKETMASTER: process.env.TICKETMASTER_API_KEY,
    CARBON_INTERFACE: process.env.CARBON_INTERFACE_API_KEY,
    BUS_RAPIDAPI_KEY: process.env.BUS_RAPIDAPI_KEY,
    BUS_RAPIDAPI_HOST: process.env.BUS_RAPIDAPI_HOST,
  };

  // --- Helper Functions ---
  const isWithinIndia = (lat: number, lon: number) => {
    return lat >= 6 && lat <= 38 && lon >= 68 && lon <= 97;
  };

  const generateUnsplashQuery = async (address: string) => {
    const prompt = `You are an intelligent travel assistant.
Input: "${address}"
Your task:
1. Extract the most relevant and recognizable place name from the address.
   - Ignore street numbers, building names, and unnecessary details.
   - Focus on city, landmark, or famous place.
2. Identify the type of place (beach, hill station, city, temple, monument, nature, desert, etc.).
3. Generate a clean and optimized search query for Unsplash in the format: "<place name> <type> travel".
Ensure the query is NOT generic (avoid words like "building", "road", "area") and visually meaningful for travel images.
Return ONLY the final search query string.`;

    try {
      const response = await aiManager.request(prompt, false);
      return response.text.trim().replace(/^"|"$/g, ''); // Remove quotes if AI adds them
    } catch (error) {
      console.error("Failed to generate Unsplash query:", error);
      return address.split(',')[0].trim() + " travel"; // Simple fallback
    }
  };

  // Helper: Haversine distance
  const getHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const geocodeAddress = async (address: string) => {
    // Normalize address: remove double commas, trim
    const normalizedAddress = address.replace(/,+/g, ',').replace(/\s+/g, ' ').trim();
    
    // 1. Try Geoapify if key exists
    if (API_KEYS.GEOAPIFY && !API_KEYS.GEOAPIFY.includes("TODO")) {
      try {
        // Add filter for country code: India (IN)
        const response = await axios.get(`https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(normalizedAddress)}&filter=countrycode:in&apiKey=${API_KEYS.GEOAPIFY}`);
        if (response.data.features && response.data.features.length > 0) {
          const feature = response.data.features[0];
          const [lon, lat] = feature.geometry.coordinates;
          const country = feature.properties.country;
          
          // Double check country is India and coordinates are within bounds
          if ((country === 'India' || feature.properties.country_code === 'in') && isWithinIndia(lat, lon)) {
            return { lat, lon };
          }
        }
      } catch (error) {
        console.warn("Geoapify geocoding failed", error);
      }
    }
    
    // 2. Try Nominatim (OpenStreetMap) as free fallback
    try {
      // Add countrycodes=in to restrict results to India
      const response = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(normalizedAddress)}&countrycodes=in&limit=1`, {
        headers: { 'User-Agent': 'SmartRouteTravelApp/1.0' }
      });
      if (response.data && response.data.length > 0) {
        const result = response.data[0];
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);
        
        if (isWithinIndia(lat, lon)) {
          return { lat, lon };
        }
      }
    } catch (nomError) {
      console.warn("Nominatim geocoding failed", nomError);
    }
    
    // 3. Fallback mock geocoding (already restricted to India)
    const mockCoords: Record<string, [number, number]> = {
      'Mumbai': [19.0760, 72.8777],
      'Pune': [18.5204, 73.8567],
      'Delhi': [28.6139, 77.2090],
      'Bangalore': [12.9716, 77.5946],
      'Nashik': [19.9975, 73.7898],
      'Hyderabad': [17.3850, 78.4867],
      'Chennai': [13.0827, 80.2707],
      'Kolkata': [22.5726, 88.3639],
      'Ahmedabad': [23.0225, 72.5714],
      'Jaipur': [26.9124, 75.7873],
    };
    
    const addr = normalizedAddress.split(',')[0].trim();
    if (mockCoords[addr]) {
      return { lat: mockCoords[addr][0], lon: mockCoords[addr][1] };
    }
    return null;
  };

  const calculateEcoScore = (carbonEmission: number) => {
    if (carbonEmission < 50) return "Eco Friendly";
    if (carbonEmission < 150) return "Moderate";
    return "Not Eco Friendly";
  };

  const getFutureDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  const generateTimes = (durationMins: number) => {
    const startHour = Math.floor(Math.random() * 12) + 6; // 6 AM to 6 PM
    const startMin = Math.floor(Math.random() * 60);
    const startTime = `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`;
    
    const endTotalMins = (startHour * 60) + startMin + durationMins;
    const endHour = Math.floor(endTotalMins / 60) % 24;
    const endMin = endTotalMins % 60;
    const endTime = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
    
    return { startTime, endTime };
  };

  const calculateArrivalTime = (departureTime: string, duration: string) => {
    try {
      // departureTime: "08:30 AM"
      // duration: "2h 15m" or "6h 0m"
      const timeParts = departureTime.split(' ');
      if (timeParts.length < 2) return departureTime; // Fallback

      const [time, modifier] = timeParts;
      let [hours, minutes] = time.split(':').map(Number);
      if (modifier === 'PM' && hours < 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;

      const durationMatch = duration.match(/(\d+)h\s*(\d*)m?/);
      const dHours = durationMatch ? parseInt(durationMatch[1]) : 0;
      const dMins = durationMatch && durationMatch[2] ? parseInt(durationMatch[2]) : 0;

      const totalMins = (hours * 60) + minutes + (dHours * 60) + dMins;
      const arrivalHours = Math.floor(totalMins / 60) % 24;
      const arrivalMins = totalMins % 60;

      const ampm = arrivalHours >= 12 ? 'PM' : 'AM';
      const displayHours = arrivalHours % 12 || 12;
      return `${displayHours.toString().padStart(2, '0')}:${arrivalMins.toString().padStart(2, '0')} ${ampm}`;
    } catch (e) {
      return departureTime;
    }
  };

  // --- API Routes ---

  // Ticketmaster Events API
  app.get("/api/events", async (req, res) => {
    const { city } = req.query;
    const apiKey = process.env.TICKETMASTER_API_KEY;

    if (!city) {
      return res.status(400).json({ error: "City parameter is required." });
    }

    if (!apiKey || apiKey.includes("TODO")) {
      console.warn("[EVENTS] Ticketmaster API key missing. Returning mock data.");
      // Fallback mock data for events
      const mockEvents = [
        { name: "Sunburn Festival", date: "2026-12-28", time: "16:00", venue: "Vagator Beach", image: "https://picsum.photos/seed/sunburn/400/300", url: "#" },
        { name: "Lollapalooza India", date: "2026-01-27", time: "14:00", venue: "Mahalaxmi Race Course", image: "https://picsum.photos/seed/lolla/400/300", url: "#" },
        { name: "NH7 Weekender", date: "2026-11-15", time: "15:00", venue: "Teerth Fields", image: "https://picsum.photos/seed/nh7/400/300", url: "#" },
      ];
      return res.json({ city, events: mockEvents });
    }

    try {
      const response = await axios.get(`https://app.ticketmaster.com/discovery/v2/events.json`, {
        params: {
          apikey: apiKey,
          city: city,
          size: 10,
          sort: "date,asc"
        }
      });

      if (!response.data._embedded || !response.data._embedded.events) {
        return res.json({ city, events: [], message: "No events found for this location." });
      }

      const events = response.data._embedded.events.map((event: any) => ({
        name: event.name,
        date: event.dates.start.localDate,
        time: event.dates.start.localTime || "TBD",
        venue: event._embedded?.venues?.[0]?.name || "TBD",
        image: event.images?.find((img: any) => img.ratio === "16_9")?.url || event.images?.[0]?.url || "",
        url: event.url
      }));

      res.json({ city, events });
    } catch (error: any) {
      console.error("Ticketmaster API Error:", error.message);
      res.status(500).json({ error: "Failed to fetch events from Ticketmaster." });
    }
  });

  // Mistral AI Journey Breakdown
  app.post("/api/ai/journey", async (req, res) => {
    const { from, to, preferredTime, selectedProviders } = req.body;
    const apiKey = process.env.MISTRAL_API_KEY;

    if (!apiKey || apiKey.includes("TODO")) {
      return res.status(400).json({ error: "Mistral API key is not configured." });
    }

    const providerConstraints = Object.entries(selectedProviders || {})
      .filter(([_, value]) => value !== null)
      .map(([mode, value]) => `- For ${mode.toUpperCase()}, you MUST use "${value}" as the provider in ALL journey options.`)
      .join('\n');

    const prompt = `Generate 4-5 travel options from "${from}" to "${to}".
  
  REQUIREMENTS:
  1. Door-to-Door: Start at "${from}", end at "${to}". Include all transfers (Cab, Bus, Train, etc.).
  2. Categories: "best" (balanced), "fastest" (flight/express), "cheapest" (bus/sleeper), "comfortable" (premium), "eco-friendly" (train/bus/walking).
  3. Providers: ${providerConstraints || 'Use realistic Indian providers (IndiGo, Air India, Ola, Uber, etc.).'}
  4. Variety: Use different timings and routes for each option.
  5. Logic: Ensure 30-60 min transfer buffers.
  6. Map: Provide lat/lng coordinates for each step.
  
  Return JSON with "journey_options" key containing objects with:
  - id, category, timeWindow, departureTime, arrivalTime, totalDuration, totalCost (INR), modes (array), isSmartest (bool), smartTag (string), routeId, steps (array of {mode, provider, from, to, time, duration, description, coordinates: [[lat,lng],...]}).`;

    try {
      const response = await aiManager.request(prompt, true);
      const content = response.text;

      if (!content || content.includes('error')) {
        throw new Error("Invalid response from AI services");
      }

      const data = JSON.parse(content);
      res.json({ ...data, _source: response.source });
    } catch (error: any) {
      console.error("AI Journey API Error:", error);
      
      // Fallback to mock data if AI fails
      console.warn("Falling back to mock journey data due to total API failure.");
      const mockData = {
        journey_options: [
          {
            id: "fallback_1",
            category: "best",
            timeWindow: "6 AM - 2 PM",
            departureTime: "08:30 AM",
            arrivalTime: "02:45 PM",
            totalDuration: "6h 15m",
            totalCost: 4500,
            modes: ['flight', 'cab'],
            isSmartest: true,
            smartTag: "BEST CHOICE",
            routeId: "fallback_route_1",
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
                description: "Last mile connectivity",
                coordinates: [[18.520, 73.856], [18.525, 73.860]]
              }
            ]
          },
          {
            id: "fallback_2",
            category: "fastest",
            timeWindow: "8 AM - 12 PM",
            departureTime: "09:00 AM",
            arrivalTime: "11:30 AM",
            totalDuration: "2h 30m",
            totalCost: 6500,
            modes: ['flight'],
            isSmartest: false,
            smartTag: "FASTEST",
            routeId: "fallback_route_2",
            steps: [
              {
                mode: 'flight',
                provider: selectedProviders.flight || "Air India",
                from: from,
                to: to,
                time: "09:00 AM",
                duration: "2h 30m",
                description: "Non-stop express flight",
                coordinates: [[19.076, 72.877], [18.525, 73.860]]
              }
            ]
          },
          {
            id: "fallback_3",
            category: "cheapest",
            timeWindow: "10 PM - 6 AM",
            departureTime: "10:00 PM",
            arrivalTime: "06:00 AM",
            totalDuration: "8h 0m",
            totalCost: 800,
            modes: ['bus'],
            isSmartest: false,
            smartTag: "CHEAPEST",
            routeId: "fallback_route_3",
            steps: [
              {
                mode: 'bus',
                provider: selectedProviders.bus || "RedBus",
                from: from,
                to: to,
                time: "10:00 PM",
                duration: "8h 0m",
                description: "Overnight budget bus",
                coordinates: [[19.076, 72.877], [18.525, 73.860]]
              }
            ]
          },
          {
            id: "fallback_4",
            category: "eco-friendly",
            timeWindow: "6 AM - 6 PM",
            departureTime: "06:00 AM",
            arrivalTime: "06:00 PM",
            totalDuration: "12h 0m",
            totalCost: 1200,
            modes: ['train'],
            isSmartest: false,
            smartTag: "ECO-FRIENDLY",
            routeId: "fallback_route_4",
            steps: [
              {
                mode: 'train',
                provider: selectedProviders.train || "Indian Railways",
                from: from,
                to: to,
                time: "06:00 AM",
                duration: "12h 0m",
                description: "Scenic and sustainable train journey",
                coordinates: [[19.076, 72.877], [18.525, 73.860]]
              }
            ]
          },
          {
            id: "fallback_5",
            category: "comfortable",
            timeWindow: "7 AM - 3 PM",
            departureTime: "07:30 AM",
            arrivalTime: "03:30 PM",
            totalDuration: "8h 0m",
            totalCost: 2500,
            modes: ['cab'],
            isSmartest: false,
            smartTag: "PREMIUM",
            routeId: "fallback_route_5",
            steps: [
              {
                mode: 'cab',
                provider: selectedProviders.cab || "MakeMyTrip",
                from: from,
                to: to,
                time: "07:30 AM",
                duration: "8h 0m",
                description: "Private premium cab service",
                coordinates: [[19.076, 72.877], [18.525, 73.860]]
              }
            ]
          }
        ]
      };
      res.json({ ...mockData, _source: "fallback" });
    }
  });

  // Intelligent Travel Assistant: Bus Data & Smart Filter
  app.get("/api/travel-assistant/bus", async (req, res) => {
    const { from, to, date, distance } = req.query;
    const dist = parseFloat(distance as string) || 0;

    if (!from || !to) {
      return res.status(400).json({ error: "From and To locations are required." });
    }

    // 1. Generate Image Query using AI
    const image_query = await generateUnsplashQuery(to as string);

    // 2. Fetch Bus Data (RapidAPI)
    let bus_options = [];
    const apiKey = process.env.BUS_RAPIDAPI_KEY;
    const apiHost = process.env.BUS_RAPIDAPI_HOST;

    if (apiKey && apiHost && !apiKey.includes("TODO")) {
      try {
        const response = await axios.get(`https://${apiHost}/search`, {
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': apiHost
          },
          params: { 
            from: (from as string).split(',')[0].trim(), 
            to: (to as string).split(',')[0].trim(), 
            date 
          }
        });
        
        if (response.data && response.data.options) {
          bus_options = response.data.options.slice(0, 5).map((opt: any) => ({
            bus_name: opt.name || opt.bus_name,
            type: opt.type || "AC Sleeper",
            departure: opt.departure || "09:00 AM",
            arrival: opt.arrival || "06:00 PM",
            duration: opt.duration || "9h 0m",
            price: opt.price || 1200,
            rating: opt.rating || "4.2"
          }));
        }
      } catch (error) {
        console.error("Bus API failed, using fallback:", error);
      }
    }

    // 4. FALLBACK (Distance based)
    if (bus_options.length === 0) {
      const providers = ["VRL Travels", "SRS Travels", "Orange Travels", "National Travels", "Zingbus"];
      const types = ["AC Sleeper", "Volvo Multi-Axle", "Non-AC Seater", "Scania Hybrid"];
      
      let minPrice = 300, maxPrice = 800;
      if (dist > 800) { minPrice = 1500; maxPrice = 3000; }
      else if (dist > 300) { minPrice = 800; maxPrice = 1500; }

      for (let i = 0; i < 5; i++) {
        const durationHours = Math.max(2, Math.floor(dist / 60) + (i % 3));
        const { startTime, endTime } = generateTimes(durationHours * 60);
        bus_options.push({
          bus_name: providers[i % providers.length],
          type: types[i % types.length],
          departure: startTime,
          arrival: endTime,
          duration: `${durationHours}h ${Math.floor(Math.random() * 60)}m`,
          price: Math.floor(Math.random() * (maxPrice - minPrice)) + minPrice,
          rating: (Math.random() * 1.5 + 3.5).toFixed(1)
        });
      }
    }

    // 3. SMART FILTER
    const cheapest = [...bus_options].sort((a, b) => a.price - b.price)[0];
    const fastest = [...bus_options].sort((a, b) => {
      const getMins = (d: string) => {
        const parts = d.split('h');
        return parseInt(parts[0]) * 60 + (parts[1] ? parseInt(parts[1]) : 0);
      };
      return getMins(a.duration) - getMins(b.duration);
    })[0];
    const best = [...bus_options].sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating))[0];

    res.json({
      image_query,
      bus_options,
      cheapest,
      fastest,
      best
    });
  });

  // AI-Powered Travel Booking Engine
  app.get("/api/booking/form", (req, res) => {
    const { type } = req.query;
    const forms: Record<string, string[]> = {
      flight: ['full_name', 'email', 'phone', 'passengers', 'class', 'seat_preference'],
      train: ['full_name', 'age', 'gender', 'id_proof', 'passengers', 'seat_preference'],
      bus: ['full_name', 'phone', 'boarding_point', 'dropping_point', 'seat_number'],
      cab: ['full_name', 'pickup_location', 'drop_location', 'pickup_time', 'car_type'],
      hotel: ['full_name', 'check_in', 'check_out', 'guests', 'room_type', 'special_requests'],
      event: ['full_name', 'tickets', 'seat_type', 'contact']
    };
    res.json({ type, fields: forms[type as string] || [] });
  });

  app.post("/api/booking/process", (req, res) => {
    const { booking_type, selected_option, user_input } = req.body;

    if (!booking_type || !selected_option || !user_input) {
      return res.status(400).json({ error: "Missing required booking data." });
    }

    // 1. DYNAMIC BOOKING FORM (Fields already defined in /form endpoint)
    const requiredFields: Record<string, string[]> = {
      flight: ['full_name', 'email', 'phone', 'passengers', 'class'],
      train: ['full_name', 'age', 'gender', 'id_proof', 'passengers'],
      bus: ['full_name', 'phone', 'boarding_point', 'dropping_point'],
      cab: ['full_name', 'pickup_location', 'drop_location', 'pickup_time'],
      hotel: ['full_name', 'check_in', 'check_out', 'guests'],
      event: ['full_name', 'tickets', 'seat_type']
    };

    // 2. VALIDATE INPUT
    const fields = requiredFields[booking_type] || [];
    const missing = fields.filter(f => !user_input[f]);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    // Normalize data
    const validated_user_data = { ...user_input };
    if (validated_user_data.full_name) {
      validated_user_data.full_name = validated_user_data.full_name.trim().split(' ').map((s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join(' ');
    }

    // 3. PROCESS BOOKING
    const departure_time = selected_option.departure || selected_option.time || selected_option.pickup_time || "09:00 AM";
    const duration = selected_option.duration || "2h 0m";
    
    // 4. ARRIVAL TIME (CRITICAL FIX)
    let arrival_time = selected_option.arrival || selected_option.arrival_time;
    if (!arrival_time) {
      arrival_time = calculateArrivalTime(departure_time, duration);
    }

    // 5. GENERATE E-TICKET
    let ticket: any = {};
    const pnr = Math.random().toString(36).substring(2, 8).toUpperCase();
    const id = Math.random().toString(36).substring(2, 10).toUpperCase();

    switch (booking_type) {
      case 'flight':
        ticket = {
          passenger_name: validated_user_data.full_name,
          flight_number: selected_option.flight_number || "AI-302",
          from: selected_option.from || "Mumbai",
          to: selected_option.to || "Delhi",
          departure_time,
          arrival_time,
          gate: "G-" + Math.floor(Math.random() * 20 + 1),
          seat_number: validated_user_data.seat_preference || "12A",
          class: validated_user_data.class || "Economy",
          PNR: pnr,
          status: "Confirmed"
        };
        break;
      case 'train':
        ticket = {
          passenger_name: validated_user_data.full_name,
          train_number: selected_option.train_number || "12951",
          coach: "B" + Math.floor(Math.random() * 5 + 1),
          seat: Math.floor(Math.random() * 60 + 1),
          from: selected_option.from || "Mumbai",
          to: selected_option.to || "Delhi",
          departure_time,
          arrival_time,
          PNR: pnr,
          status: "Confirmed"
        };
        break;
      case 'bus':
        ticket = {
          passenger_name: validated_user_data.full_name,
          bus_name: selected_option.bus_name || "VRL Travels",
          seat_number: validated_user_data.seat_number || "L-12",
          boarding_point: validated_user_data.boarding_point,
          dropping_point: validated_user_data.dropping_point,
          departure_time,
          arrival_time,
          status: "Confirmed"
        };
        break;
      case 'cab':
        ticket = {
          passenger_name: validated_user_data.full_name,
          driver_name: "Rajesh Kumar",
          vehicle_number: "MH 01 AB 1234",
          pickup_location: validated_user_data.pickup_location,
          drop_location: validated_user_data.drop_location,
          pickup_time: validated_user_data.pickup_time,
          estimated_arrival_time: arrival_time,
          fare: selected_option.price || "₹450"
        };
        break;
      case 'hotel':
        ticket = {
          guest_name: validated_user_data.full_name,
          hotel_name: selected_option.name || "The Taj Palace",
          room_type: validated_user_data.room_type || "Deluxe Room",
          check_in: validated_user_data.check_in,
          check_out: validated_user_data.check_out,
          guests: validated_user_data.guests,
          booking_id: id
        };
        break;
      case 'event':
        ticket = {
          attendee_name: validated_user_data.full_name,
          event_name: selected_option.name || "Sunburn Festival",
          venue: selected_option.venue || "Vagator Beach",
          date_time: selected_option.date + " " + selected_option.time,
          seat_type: validated_user_data.seat_type || "General Access",
          ticket_id: id
        };
        break;
    }

    res.json({
      booking_type,
      form_fields: fields,
      validated_user_data,
      ticket,
      status: "confirmed"
    });
  });

  // Mistral AI Chat
  app.post("/api/ai/chat", async (req, res) => {
    const { message, history } = req.body;
    const apiKey = process.env.MISTRAL_API_KEY;

    if (!apiKey || apiKey.includes("TODO")) {
      return res.status(400).json({ error: "Mistral API key is not configured." });
    }

    try {
      const systemPrompt = "You are SmartRoute AI, an expert travel assistant. You ONLY help users with travel-related queries such as route suggestions, destination info, and travel logistics. If a user asks about anything non-travel related, politely decline and redirect them to travel topics. Be concise, helpful, and friendly.";
      
      const fullPrompt = `${systemPrompt}\n\nHistory:\n${(history || []).map((msg: any) => `${msg.role}: ${msg.text}`).join('\n')}\n\nUser: ${message}\n\nAssistant:`;

      const response = await aiManager.request(fullPrompt);
      const reply = response.text;

      res.json({ 
        reply: reply || "I'm currently experiencing high traffic. I can still help you with route planning and bookings! What destination are you thinking of?",
        _source: response.source
      });
    } catch (error: any) {
      console.error("AI Chat API Error:", error);
      res.json({ reply: "I'm currently experiencing high traffic. I can still help you with route planning and bookings! What destination are you thinking of?" });
    }
  });

  // Mistral AI Suggestions
  app.post("/api/ai/suggestions", async (req, res) => {
    const { source, destination, budget } = req.body;
    const apiKey = process.env.MISTRAL_API_KEY;

    if (!apiKey || apiKey.includes("TODO")) {
      return res.status(400).json({ error: "Mistral API key is not configured." });
    }

    try {
      const prompt = `Suggest a complete travel plan from ${source} to ${destination} with a budget of $${budget}. Include flights, hotels, and activities. Return the plan as a JSON object with itinerary (array of objects with day, activities, estimatedCost), totalEstimatedCost, travelTips (array of strings), and budgetBreakdown (object with transport, accommodation, food, activities).`;
      
      const response = await aiManager.request(prompt, true);
      const content = response.text;

      if (!content || content.includes('error')) {
        throw new Error("Invalid response from AI services");
      }

      const plan = JSON.parse(content);
      res.json({ ...plan, _source: response.source });
    } catch (error: any) {
      console.error("AI Suggestions API Error:", error);
      // Fallback mock plan
      const mockPlan = {
        itinerary: [
          { day: 1, activities: "Arrival and check-in at local boutique hotel. Evening walk at city center.", estimatedCost: 150 },
          { day: 2, activities: "Full day city tour visiting major landmarks and local markets.", estimatedCost: 100 },
          { day: 3, activities: "Day trip to nearby scenic locations or cultural sites.", estimatedCost: 200 }
        ],
        totalEstimatedCost: 450,
        travelTips: ["Book local transport in advance", "Try street food at the main square", "Carry a local SIM card"],
        budgetBreakdown: { transport: 150, accommodation: 200, food: 100, activities: 50 }
      };
      res.json(mockPlan);
    }
  });

  // Geocoding API
  app.get("/api/geocode", async (req, res) => {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: "Address required" });

    try {
      const coords = await geocodeAddress(address as string);
      if (!coords) {
        return res.status(404).json({ error: "Location not found in India. Only Indian addresses are supported." });
      }
      res.json(coords);
    } catch (error) {
      console.error("Geocoding failed", error);
      res.status(500).json({ error: "Geocoding failed" });
    }
  });

  // Dynamic Map Route API
  app.get("/api/map-route", async (req, res) => {
    const { source, destination } = req.query;
    
    // 1. INPUT VALIDATION
    if (!source || !destination) {
      return res.status(400).json({ error: "Source and destination are required parameters." });
    }

    try {
      // 2. GEOCODING WITH VALIDATION
      const [srcCoords, destCoords] = await Promise.all([
        geocodeAddress(source as string),
        geocodeAddress(destination as string)
      ]);

      if (!srcCoords || !destCoords) {
        return res.status(404).json({ 
          error: "Geocoding failed", 
          message: `Could not find coordinates for: ${!srcCoords ? source : destination}. Only Indian locations are supported.` 
        });
      }

      // Validate coordinate ranges
      const isValid = (c: any) => c && typeof c.lat === 'number' && typeof c.lon === 'number' && !isNaN(c.lat) && !isNaN(c.lon);
      if (!isValid(srcCoords) || !isValid(destCoords)) {
        throw new Error("Invalid coordinates returned from geocoder.");
      }

      const directDistance = getHaversineDistance(srcCoords.lat, srcCoords.lon, destCoords.lat, destCoords.lon);
      
      // 3. ROUTE FETCHING WITH RETRY & FALLBACK
      let routeData = { 
        distance: `${directDistance.toFixed(1)} km`, 
        duration: `${Math.floor(directDistance / 60)}h ${Math.floor((directDistance % 60) / 60 * 60)}m`, 
        polyline: polyline.encode([[srcCoords.lat, srcCoords.lon], [destCoords.lat, destCoords.lon]]) 
      };
      
      const fetchRouteWithRetry = async (url: string, retries = 2): Promise<any> => {
        for (let i = 0; i <= retries; i++) {
          try {
            const response = await axios.get(url, { timeout: 5000 });
            if (response.data.code === 'Ok') return response.data;
            throw new Error(`OSRM error: ${response.data.code}`);
          } catch (err: any) {
            if (i === retries) throw err;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
          }
        }
      };

      try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${srcCoords.lon},${srcCoords.lat};${destCoords.lon},${destCoords.lat}?overview=full&geometries=polyline`;
        const data = await fetchRouteWithRetry(osrmUrl);

        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          routeData = {
            distance: `${(route.distance / 1000).toFixed(1)} km`,
            duration: `${Math.floor(route.duration / 3600)}h ${Math.floor((route.duration % 3600) / 60)}m`,
            polyline: route.geometry
          };
        }
      } catch (routeError) {
        console.warn("[MapRoute] OSRM failed, using straight-line fallback:", (routeError as Error).message);
      }

      res.json({
        source: { lat: srcCoords.lat, lng: srcCoords.lon },
        destination: { lat: destCoords.lat, lng: destCoords.lon },
        distance: routeData.distance,
        duration: routeData.duration,
        routePolyline: routeData.polyline
      });
    } catch (error: any) {
      console.error("[MapRoute] API Error:", error.message);
      res.status(500).json({ error: "Internal Routing Error", details: error.message });
    }
  });

  // --- NEW BOOKING ENDPOINTS ---
  const generateBookingId = (prefix: string) => `${prefix}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

  app.post("/api/book/:service", async (req, res) => {
    const { service } = req.params;
    const { userId, details } = req.body;

    if (!userId || !details) {
      return res.status(400).json({ error: "userId and booking details are required." });
    }

    const bookingId = generateBookingId(service.toUpperCase().substring(0, 3));
    
    // In a real production app, we would save to Firestore here
    // For this environment, we return the structured data for the frontend to handle
    
    const booking = {
      bookingType: service,
      bookingId,
      userId,
      details,
      createdAt: new Date().toISOString(),
      status: "confirmed"
    };

    console.log(`[BOOKING] New ${service} booking: ${bookingId}`);
    res.json(booking);
  });

  // --- Cab Options System ---
  const CAB_TYPES = [
    { type: "Mini", baseFare: 50, costPerKm: 12, capacity: 4, icon: "Car" },
    { type: "Sedan", baseFare: 80, costPerKm: 16, capacity: 4, icon: "CarFront" },
    { type: "SUV", baseFare: 120, costPerKm: 22, capacity: 6, icon: "Truck" },
  ];

  const calculateCabFares = (distanceKm: number, durationMins: number) => {
    const surgeMultiplier = 1 + (Math.random() * 0.2); // Random 0-20% surge
    const arrivalTimeMins = Math.floor(Math.random() * 8) + 2; // 2-10 mins arrival

    const options = CAB_TYPES.map((cab) => {
      const basePrice = cab.baseFare + (distanceKm * cab.costPerKm);
      const finalPrice = Math.round(basePrice * surgeMultiplier);
      const carbonEmission = Math.round(distanceKm * 0.12); // ~120g CO2 per km
      const { startTime, endTime } = generateTimes(durationMins);

      return {
        id: `cab_${cab.type.toLowerCase()}_${Math.random().toString(36).substr(2, 5)}`,
        name: cab.type,
        type: "cab",
        provider: "SmartRoute Cab",
        price: finalPrice,
        duration: `${durationMins}m`,
        startTime,
        endTime,
        startDate: getFutureDate(0),
        endDate: getFutureDate(0),
        arrivalTime: `${arrivalTimeMins}m`,
        capacity: cab.capacity,
        carbonEmission,
        ecoScore: calculateEcoScore(carbonEmission),
        surgeApplied: surgeMultiplier > 1.1
      };
    });

    // Tagging logic
    const sortedByPrice = [...options].sort((a, b) => a.price - b.price);
    const cheapestId = sortedByPrice[0].id;
    const recommendedId = options[1].id; // Usually Sedan is recommended

    return options.map(opt => ({
      ...opt,
      classification: opt.id === cheapestId ? 'cheapest' : (opt.id === recommendedId ? 'smartest' : 'comfortable')
    }));
  };

  app.get("/api/cabs", async (req, res) => {
    const { from, to } = req.query;
    console.log(`[API] Cab Search: from=${from}, to=${to}`);

    try {
      // In real app: Fetch distance/time from OpenRouteService
      const distanceKm = Math.floor(Math.random() * 30) + 2; // 2-32km
      const durationMins = Math.floor(distanceKm * 3); // ~3 mins per km in Indian traffic

      const cabOptions = calculateCabFares(distanceKm, durationMins);
      res.json({ results: cabOptions, distance: distanceKm, duration: durationMins });
    } catch (error) {
      console.error("Cab search failed", error);
      res.status(500).json({ error: "Cab search failed" });
    }
  });

  // 1. Unified Search API Flow
  app.get("/api/search", async (req, res) => {
    const { from, to, date, type } = req.query;
    console.log(`[API] Unified Search: from=${from}, to=${to}, type=${type}`);

    try {
      const results: any[] = [];
      const travelDate = (date as string) || getFutureDate(1);

      // Fetch Hotels & Restaurants from Geoapify (Simulated if no key)
      if (type === "hotel" || type === "restaurant" || !type || type === "all") {
        try {
          if (type === "hotel" || !type || type === "all") {
            const mockHotels = [
              { id: "h1", name: "Taj Mahal Palace", price: 15500, rating: 4.9, type: "hotel", image: "https://picsum.photos/seed/taj/400/300", classification: 'comfortable', duration: '1 Night', startTime: '12:00', endTime: '11:00', startDate: travelDate, endDate: getFutureDate(2), entryTime: '12:00 PM', exitTime: '11:00 AM', distanceFromCenter: '0.5 km' },
              { id: "h2", name: "JW Marriott", price: 8500, rating: 4.7, type: "hotel", image: "https://picsum.photos/seed/marriott/400/300", classification: 'smartest', duration: '1 Night', startTime: '14:00', endTime: '12:00', startDate: travelDate, endDate: getFutureDate(2), entryTime: '02:00 PM', exitTime: '12:00 PM', distanceFromCenter: '2.1 km' },
              { id: "h3", name: "The Oberoi", price: 12000, rating: 4.8, type: "hotel", image: "https://picsum.photos/seed/oberoi/400/300", classification: 'comfortable', duration: '1 Night', startTime: '12:00', endTime: '11:00', startDate: travelDate, endDate: getFutureDate(2), entryTime: '12:00 PM', exitTime: '11:00 AM', distanceFromCenter: '1.2 km' },
              { id: "h4", name: "Ginger Hotel", price: 3200, rating: 4.1, type: "hotel", image: "https://picsum.photos/seed/ginger/400/300", classification: 'cheapest', duration: '1 Night', startTime: '14:00', endTime: '12:00', startDate: travelDate, endDate: getFutureDate(2), entryTime: '02:00 PM', exitTime: '12:00 PM', distanceFromCenter: '5.5 km' },
              { id: "h5", name: "Ibis Styles", price: 2800, rating: 3.9, type: "hotel", image: "https://picsum.photos/seed/ibis/400/300", classification: 'cheapest', duration: '1 Night', startTime: '12:00', endTime: '11:00', startDate: travelDate, endDate: getFutureDate(2), entryTime: '12:00 PM', exitTime: '11:00 AM', distanceFromCenter: '4.8 km' },
            ];
            results.push(...mockHotels);
          }

          if (type === "restaurant" || !type || type === "all") {
            const mockRestaurants = [
              { id: "r1", name: "The Table", price: 2500, rating: 4.8, type: "restaurant", image: "https://picsum.photos/seed/table/400/300", classification: 'smartest', duration: '2h', bookingDate: travelDate, timeSlot: '07:30 PM', popularity: 95 },
              { id: "r2", name: "Trishna", price: 3500, rating: 4.7, type: "restaurant", image: "https://picsum.photos/seed/trishna/400/300", classification: 'comfortable', duration: '2h', bookingDate: travelDate, timeSlot: '08:00 PM', popularity: 92 },
              { id: "r3", name: "Bademiya", price: 800, rating: 4.5, type: "restaurant", image: "https://picsum.photos/seed/bademiya/400/300", classification: 'cheapest', duration: '1h', bookingDate: travelDate, timeSlot: '09:00 PM', popularity: 98 },
            ];
            results.push(...mockRestaurants);
          }
        } catch (e) {
          console.error("Geoapify failed", e);
        }
      }

      // Fetch Events
      if (type === "event" || !type || type === "all") {
        const mockEvents = [
          { id: "e1", name: "Sunburn Festival", price: 5000, rating: 4.9, type: "event", image: "https://picsum.photos/seed/sunburn/400/300", classification: 'comfortable', duration: '6h', bookingDate: travelDate, timeSlot: '04:00 PM', popularity: 99 },
          { id: "e2", name: "Standup Comedy Night", price: 1200, rating: 4.6, type: "event", image: "https://picsum.photos/seed/comedy/400/300", classification: 'smartest', duration: '2h', bookingDate: travelDate, timeSlot: '08:00 PM', popularity: 85 },
          { id: "e3", name: "Art Workshop", price: 500, rating: 4.4, type: "event", image: "https://picsum.photos/seed/art/400/300", classification: 'cheapest', duration: '3h', bookingDate: travelDate, timeSlot: '11:00 AM', popularity: 70 },
        ];
        results.push(...mockEvents);
      }

      // Fetch Flights from Aviationstack (Simulated if no key)
      if (type === "flight" || !type || type === "all") {
        try {
          const mockFlights = [
            { id: "f1", provider: "IndiGo", price: 4500, duration: "2h 15m", type: "flight", rating: 4.2, classification: 'fastest', image: 'https://picsum.photos/seed/indigo/400/300', startTime: '06:30', endTime: '08:45', startDate: travelDate, endDate: travelDate },
            { id: "f2", provider: "Air India", price: 5200, duration: "2h 10m", type: "flight", rating: 4.5, classification: 'smartest', carbonEmission: 80, image: 'https://picsum.photos/seed/airindia/400/300', startTime: '10:15', endTime: '12:25', startDate: travelDate, endDate: travelDate },
            { id: "f3", provider: "Vistara", price: 6500, duration: "2h 05m", type: "flight", rating: 4.8, classification: 'comfortable', image: 'https://picsum.photos/seed/vistara/400/300', startTime: '14:45', endTime: '16:50', startDate: travelDate, endDate: travelDate },
            { id: "f4", provider: "SpiceJet", price: 3800, duration: "2h 20m", type: "flight", rating: 3.8, classification: 'cheapest', image: 'https://picsum.photos/seed/spicejet/400/300', startTime: '18:20', endTime: '20:40', startDate: travelDate, endDate: travelDate },
            { id: "f5", provider: "Akasa Air", price: 4100, duration: "2h 15m", type: "flight", rating: 4.0, classification: 'cheapest', image: 'https://picsum.photos/seed/akasa/400/300', startTime: '21:00', endTime: '23:15', startDate: travelDate, endDate: travelDate },
          ];
          results.push(...mockFlights);
        } catch (e) {
          console.error("Aviationstack failed", e);
        }
      }

      // Fetch Trains (Simulated)
      if (type === "train" || !type || type === "all") {
        try {
          const mockTrains = [
            { id: "t1", provider: "Shatabdi Express", price: 1200, duration: "3h 30m", type: "train", rating: 4.6, classification: 'fastest', image: 'https://picsum.photos/seed/shatabdi/400/300', startTime: '05:45', endTime: '09:15', startDate: travelDate, endDate: travelDate },
            { id: "t2", provider: "Deccan Queen", price: 850, duration: "4h 15m", type: "train", rating: 4.4, classification: 'smartest', image: 'https://picsum.photos/seed/deccan/400/300', startTime: '07:10', endTime: '11:25', startDate: travelDate, endDate: travelDate },
            { id: "t3", provider: "Rajdhani Express", price: 2500, duration: "15h 30m", type: "train", rating: 4.7, classification: 'comfortable', image: 'https://picsum.photos/seed/rajdhani/400/300', startTime: '16:40', endTime: '08:10', startDate: travelDate, endDate: getFutureDate(2) },
            { id: "t4", provider: "Duronto Express", price: 1800, duration: "14h 00m", type: "train", rating: 4.5, classification: 'smartest', image: 'https://picsum.photos/seed/duronto/400/300', startTime: '20:15', endTime: '10:15', startDate: travelDate, endDate: getFutureDate(2) },
            { id: "t5", provider: "Local Passenger", price: 150, duration: "6h 00m", type: "train", rating: 3.8, classification: 'cheapest', image: 'https://picsum.photos/seed/local/400/300', startTime: '09:00', endTime: '15:00', startDate: travelDate, endDate: travelDate },
          ];
          results.push(...mockTrains);
        } catch (e) {
          console.error("Train search failed", e);
        }
      }

      // Fetch Cabs (Simulated)
      if (type === "cab" || !type || type === "all") {
        try {
          const distanceKm = Math.floor(Math.random() * 30) + 2;
          const durationMins = Math.floor(distanceKm * 3);
          const cabOptions = calculateCabFares(distanceKm, durationMins);
          results.push(...cabOptions);
        } catch (e) {
          console.error("Cab search failed", e);
        }
      }

      // Add Eco Scores to results
      const finalResults = results.map(item => ({
        ...item,
        ecoScore: item.carbonEmission ? calculateEcoScore(item.carbonEmission) : "Moderate"
      }));

      console.log(`[API] Returning ${finalResults.length} results`);
      res.json({ results: finalResults });
    } catch (error) {
      console.error("Search failed", error);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // 2. Routing System Integration
  app.get("/api/routes", async (req, res) => {
    const { from, to, distance, time, selectedProviders } = req.query;
    console.log(`[API] Routing: from=${from}, to=${to}, distance=${distance}, time=${time}, providers=${selectedProviders}`);

    try {
      const dist = parseFloat(distance as string) || 420;
      const travelDate = getFutureDate(1);
      
      const providersObj = selectedProviders ? JSON.parse(selectedProviders as string) : {};
      
      // Helper to generate implementation options
      const getImplementationOptions = (mode: string, price: number) => {
        const modeKey = mode.toLowerCase().includes("flight") ? "flight" : 
                        (mode.toLowerCase().includes("train") ? "train" : 
                        (mode.toLowerCase().includes("bus") ? "bus" : "cab"));
        
        const fixedProvider = providersObj[modeKey];

        const allProviders = mode.includes("Flight") ? ["IndiGo", "Air India", "Vistara", "SpiceJet"] : 
                             mode.includes("Train") ? ["Shatabdi Exp", "Rajdhani Exp", "Deccan Queen", "Duronto Exp"] :
                             mode.includes("Bus") ? ["MSRTC Shivneri", "Purple Bus", "Neeta Travels", "Zingbus"] :
                             ["Uber Intercity", "Ola Outstation", "SmartRoute Cab", "Local Taxi"];
        
        const providers = fixedProvider ? [fixedProvider] : allProviders;
        
        return providers.map((p, i) => {
          const duration = mode.includes("Flight") ? "2h 15m" : (mode.includes("Train") ? "4h 30m" : "6h 00m");
          const { startTime, endTime } = generateTimes(mode.includes("Flight") ? 135 : (mode.includes("Train") ? 270 : 360));
          return {
            id: `impl_${Math.random().toString(36).substr(2, 5)}`,
            name: p,
            provider: p,
            type: modeKey,
            price: Math.round(price * (0.8 + Math.random() * 0.4)),
            duration,
            startTime,
            endTime,
            startDate: travelDate,
            endDate: travelDate,
            rating: 3.5 + Math.random() * 1.5,
            image: `https://picsum.photos/seed/${p}/400/300`
          };
        });
      };

      // Simulate multi-modal results based on distance
      const generateRouteForTime = (startTime: string, offsetMins: number, modeType: 'fastest' | 'cheapest' | 'smartest') => {
        const startParts = startTime.split(':').map(Number);
        const startTotalMins = (startParts[0] * 60) + startParts[1] + offsetMins;
        
        const formatTime = (totalMins: number) => {
          const h = Math.floor(totalMins / 60) % 24;
          const m = totalMins % 60;
          return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        };

        if (modeType === 'fastest') {
          const provider = providersObj.flight || 'IndiGo 6E-' + Math.floor(100 + Math.random() * 900);
          return {
            startTime: formatTime(startTotalMins),
            endTime: formatTime(startTotalMins + 135),
            steps: [
              { mode: 'Flight', provider, startTime: formatTime(startTotalMins), endTime: formatTime(startTotalMins + 135), date: travelDate, detail: `Non-stop Flight from ${from}`, cost: Math.round(dist * 12) }
            ]
          };
        }

        if (modeType === 'cheapest') {
          const provider = providersObj.bus || 'MSRTC Shivneri';
          return {
            startTime: formatTime(startTotalMins),
            endTime: formatTime(startTotalMins + 840),
            steps: [
              { mode: 'Bus', provider, startTime: formatTime(startTotalMins), endTime: formatTime(startTotalMins + 840), date: travelDate, detail: `Direct Bus from ${from} to ${to}`, cost: Math.round(dist * 1.2) }
            ]
          };
        }

        return {
          startTime: formatTime(startTotalMins),
          endTime: formatTime(startTotalMins + 600), // 10h duration
          steps: [
            { mode: 'Train', provider: providersObj.train || 'Shatabdi Express', startTime: formatTime(startTotalMins), endTime: formatTime(startTotalMins + 270), date: travelDate, detail: `Superfast Train from ${from}`, cost: Math.round(dist * 3) },
            { mode: 'Bus', provider: providersObj.bus || 'Purple Bus', startTime: formatTime(startTotalMins + 300), endTime: formatTime(startTotalMins + 510), date: travelDate, detail: `Luxury Bus to outskirts of ${to}`, cost: Math.round(dist * 2) },
            { mode: 'Cab', provider: providersObj.cab || 'Ola Outstation', startTime: formatTime(startTotalMins + 525), endTime: formatTime(startTotalMins + 600), date: travelDate, detail: `Last mile Cab to ${to}`, cost: Math.round(dist * 1) }
          ]
        };
      };

      const generateMultipleOptions = (modeType: 'fastest' | 'cheapest' | 'smartest') => {
        const baseTimes = ['06:00', '09:00', '12:00', '15:00', '18:00'];
        return baseTimes.map((time, idx) => {
          const route = generateRouteForTime(time, 0, modeType);
          const totalCost = route.steps.reduce((acc, s) => acc + s.cost, 0);
          const durationMins = route.steps.reduce((acc, s) => {
            const start = s.startTime.split(':').map(Number);
            const end = s.endTime.split(':').map(Number);
            let diff = (end[0] * 60 + end[1]) - (start[0] * 60 + start[1]);
            if (diff < 0) diff += 1440;
            return acc + diff;
          }, 0);
          
          return {
            id: `${modeType}_option_${idx}`,
            distance: `${Math.round(dist)}km`,
            time: `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`,
            cost: totalCost,
            classification: modeType,
            carbonEmission: Math.round(dist * (modeType === 'fastest' ? 0.4 : (modeType === 'cheapest' ? 0.15 : 0.2))),
            startTime: route.startTime,
            endTime: route.endTime,
            startDate: travelDate,
            endDate: travelDate,
            steps: route.steps,
            options: getImplementationOptions(route.steps[0].mode, route.steps[0].cost)
          };
        });
      };

      const routes = {
        fastest: generateMultipleOptions('fastest'),
        cheapest: generateMultipleOptions('cheapest'),
        smartest: generateMultipleOptions('smartest'),
        comfortable: generateMultipleOptions('smartest').map(r => ({ ...r, classification: 'comfortable' }))
      };

      // Generate provider options for all modes
      const providerOptions = {
        flight: getImplementationOptions('Flight', Math.round(dist * 12)),
        train: getImplementationOptions('Train', Math.round(dist * 3)),
        bus: getImplementationOptions('Bus', Math.round(dist * 1.5)),
        cab: getImplementationOptions('Cab', Math.round(dist * 1))
      };

      // Calculate Eco Scores for routes
      const finalRoutes: any = {};
      for (const [key, options] of Object.entries(routes)) {
        finalRoutes[key] = (options as any[]).map(option => ({
          ...option,
          ecoScore: calculateEcoScore(option.carbonEmission)
        }));
      }

      res.json({
        routes: finalRoutes,
        providerOptions
      });
    } catch (error) {
      console.error("Routing failed", error);
      res.status(500).json({ error: "Routing failed" });
    }
  });

  // 3. Booking Logic
  app.post("/api/bookings", async (req, res) => {
    const { userId, itemDetails, price } = req.body;
    console.log(`[API] Booking Request: user=${userId}, item=${itemDetails.name}`);

    try {
      // In real app: Store in Firestore
      // const bookingRef = await db.collection('bookings').add({ userId, itemDetails, price, status: 'confirmed', timestamp: new Date().toISOString() });
      
      res.json({ 
        success: true, 
        bookingId: "BK" + Math.random().toString(36).substr(2, 9).toUpperCase(),
        message: "Booking confirmed! A notification has been sent."
      });
    } catch (error) {
      console.error("Booking failed", error);
      res.status(500).json({ error: "Booking failed" });
    }
  });

  // Email Notification API using SendGrid
  app.post("/api/send-ticket", async (req, res) => {
    const { email, bookingId, passengerName, details } = req.body;
    
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;

    const isPlaceholder = (val?: string) => !val || val.includes("TODO") || val.includes("KEYHERE") || val.length < 10;

    if (isPlaceholder(apiKey) || isPlaceholder(fromEmail)) {
      console.warn("[EMAIL] SendGrid configuration missing or using placeholders. Skipping email.");
      return res.json({ 
        success: true, 
        simulated: true,
        message: "Email simulation successful (SendGrid not configured with valid credentials)" 
      });
    }

    // Initialize/Update API Key just in case it changed
    sgMail.setApiKey(apiKey);

    const generateStepsHtml = (steps: any[]) => {
      if (!steps || steps.length === 0) return '';
      return `
        <div style="margin-top: 30px;">
          <div class="label" style="margin-bottom: 15px;">Journey Breakdown</div>
          ${steps.map((step, idx) => `
            <div style="background: #ffffff; border-radius: 16px; padding: 20px; margin-bottom: 12px; border: 1px solid #e2e8f0;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                <div>
                  <div style="font-size: 10px; font-weight: 800; color: #4f46e5; text-transform: uppercase; letter-spacing: 1px;">${step.mode}</div>
                  <div style="font-size: 14px; font-weight: 800; color: #0f172a;">${step.provider || step.name || 'Service Provider'}</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;">Time</div>
                  <div style="font-size: 12px; font-weight: 700; color: #0f172a;">${step.startTime} - ${step.endTime || step.arrivalTime || 'N/A'}</div>
                </div>
              </div>
              <div style="font-size: 11px; color: #64748b;">${step.from} → ${step.to}</div>
              ${step.details ? `<div style="font-size: 10px; color: #94a3b8; margin-top: 5px;">${step.details}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    };

    const msg = {
      to: email,
      from: fromEmail,
      subject: `Booking Confirmed: ${details.from} to ${details.to} - TripSutra`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Inter', -apple-system, sans-serif; color: #1e293b; line-height: 1.6; margin: 0; padding: 0; background: #f8fafc; }
            .container { max-width: 600px; margin: 40px auto; border-radius: 32px; overflow: hidden; background: #ffffff; box-shadow: 0 20px 50px rgba(79, 70, 229, 0.1); }
            .header { background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); padding: 60px 40px; text-align: center; color: white; }
            .logo { font-size: 24px; font-weight: 900; text-transform: uppercase; letter-spacing: 6px; margin-bottom: 12px; }
            .status-badge { display: inline-block; background: rgba(255,255,255,0.15); padding: 6px 16px; border-radius: 100px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; }
            .content { padding: 50px; }
            .greeting { font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 24px; }
            .ticket-card { background: #f1f5f9; border-radius: 24px; padding: 40px; margin-bottom: 40px; position: relative; border: 1px solid #e2e8f0; }
            .row { display: flex; justify-content: space-between; margin-bottom: 32px; }
            .col { flex: 1; }
            .label { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 6px; }
            .value { font-size: 16px; font-weight: 700; color: #0f172a; }
            .divider { height: 1px; border-top: 2px dashed #cbd5e1; margin: 32px 0; }
            .footer { background: #f8fafc; padding: 40px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
            .btn { display: inline-block; padding: 18px 36px; background: #4f46e5; color: #ffffff !important; text-decoration: none; border-radius: 20px; font-weight: 800; font-size: 14px; box-shadow: 0 10px 25px rgba(79, 70, 229, 0.2); }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">TripSutra</div>
              <div class="status-badge">Official E-Ticket</div>
              <h1 style="font-size: 28px; margin-top: 24px; margin-bottom: 0; font-weight: 800;">Adventure Awaits!</h1>
            </div>
            
            <div class="content">
              <div class="greeting">Hello ${passengerName},</div>
              <p style="color: #475569; margin-bottom: 40px; font-size: 15px;">Your journey has been confirmed. We've secured your spot and everything is ready for your departure.</p>
              
              <div class="ticket-card">
                <div class="row">
                  <div class="col">
                    <div class="label">Booking Reference</div>
                    <div class="value" style="color: #4f46e5;">#${bookingId}</div>
                  </div>
                  <div class="col" style="text-align: right;">
                    <div class="label">Service Type</div>
                    <div class="value" style="text-transform: capitalize;">${details.service || 'Travel'}</div>
                  </div>
                </div>
                
                <div class="divider"></div>
                
                <div class="row">
                  <div class="col">
                    <div class="label">Origin</div>
                    <div class="value">${details.from}</div>
                  </div>
                  <div class="col" style="text-align: center; display: flex; align-items: center; justify-content: center;">
                    <div style="width: 40px; height: 2px; background: #cbd5e1;"></div>
                  </div>
                  <div class="col" style="text-align: right;">
                    <div class="label">Destination</div>
                    <div class="value">${details.to}</div>
                  </div>
                </div>
                
                <div class="row">
                  <div class="col">
                    <div class="label">${(details.service === 'hotel' || details.service === 'event') ? 'Start Time' : 'Departure'}</div>
                    <div class="value">${details.date || 'Today'} at ${details.startTime || '09:00 AM'}</div>
                  </div>
                  <div class="col" style="text-align: right;">
                    <div class="label">${(details.service === 'hotel' || details.service === 'event') ? 'End Time' : 'Arrival / End'}</div>
                    <div class="value">${details.endTime || '05:00 PM'}</div>
                  </div>
                </div>

                <div class="row" style="margin-bottom: 0;">
                  <div class="col">
                    <div class="label">Service Provider</div>
                    <div class="value">${req.body.provider || details.provider || 'Verified Service'}</div>
                  </div>
                  <div class="col" style="text-align: right;">
                    <div class="label">Amount Paid</div>
                    <div class="value" style="font-size: 22px;">₹${details.price?.toLocaleString()}</div>
                  </div>
                </div>

                ${req.body.segments ? generateStepsHtml(req.body.segments) : ''}
              </div>
              
              <div style="text-align: center;">
                <a href="${process.env.APP_URL || '#'}/profile" class="btn">View Digital Pass</a>
              </div>
            </div>
            
            <div class="footer">
              <p style="margin-bottom: 12px;">&copy; 2026 TripSutra Travel Technologies.</p>
              <p>Need assistance? Contact our 24/7 concierge at <a href="mailto:support@tripsutra.travel" style="color: #4f46e5; text-decoration: none;">support@tripsutra.travel</a></p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    try {
      await sgMail.send(msg);
      console.log(`[EMAIL] Success: Ticket sent to ${email}`);
      res.json({ success: true, message: "Booking confirmation sent successfully" });
    } catch (error: any) {
      const errorMessage = error.response?.body?.errors?.[0]?.message || error.message;
      
      if (errorMessage.includes("verified Sender Identity")) {
        console.warn("[EMAIL] Warning: Sender Identity Unverified.");
        return res.json({ 
          success: true, 
          warning: "Sender Identity Unverified",
          message: "Booking confirmed, but email skipped due to unverified sender identity. Please verify SENDGRID_FROM_EMAIL in your SendGrid dashboard."
        });
      }

      if (errorMessage.includes("authorization grant") || errorMessage.includes("unauthorized")) {
        console.warn("[EMAIL] Warning: Invalid SendGrid API Key.");
        return res.json({
          success: true,
          warning: "Invalid API Key",
          message: "Booking confirmed, but email skipped due to an invalid SendGrid API Key. Please check SENDGRID_API_KEY in your App Settings."
        });
      }
      
      console.error("[EMAIL] SendGrid Error:", errorMessage);
      res.status(500).json({ error: "Failed to deliver confirmation email" });
    }
  });

  // AI Travel Optimizer
  app.post("/api/travel-optimizer", (req, res) => {
    const { options } = req.body;

    if (!options || !Array.isArray(options) || options.length === 0) {
      return res.status(400).json({ error: "A list of travel options is required." });
    }

    const timeToMinutes = (timeStr: string) => {
      if (!timeStr) return 0;
      const [time, modifier] = timeStr.split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      if (modifier === 'PM' && hours < 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    };

    const compareOptions = (a: any, b: any, criteria: (opt: any) => number, ascending = true) => {
      const valA = criteria(a);
      const valB = criteria(b);
      if (valA !== valB) {
        return ascending ? valA - valB : valB - valA;
      }
      // Tie-breaker: earlier departure
      return timeToMinutes(a.departure_time) - timeToMinutes(b.departure_time);
    };

    // 1. FASTEST: Min duration
    const fastest = [...options].sort((a, b) => compareOptions(a, b, (o) => o.duration))[0];

    // 2. CHEAPEST: Min price
    const cheapest = [...options].sort((a, b) => compareOptions(a, b, (o) => o.price))[0];

    // 3. PREMIUM: Highest comfort, then highest price
    const comfortRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const premium = [...options].sort((a, b) => {
      const rankA = comfortRank[a.comfort] || 0;
      const rankB = comfortRank[b.comfort] || 0;
      if (rankA !== rankB) return rankB - rankA;
      if (a.price !== b.price) return b.price - a.price;
      return timeToMinutes(a.departure_time) - timeToMinutes(b.departure_time);
    })[0];

    // 4. ECO: train > bus > cab > flight, then lowest price
    const ecoRank: Record<string, number> = { train: 1, bus: 2, cab: 3, flight: 4 };
    const eco = [...options].sort((a, b) => {
      const rankA = ecoRank[a.transport_type] || 5;
      const rankB = ecoRank[b.transport_type] || 5;
      if (rankA !== rankB) return rankA - rankB;
      if (a.price !== b.price) return a.price - b.price;
      return timeToMinutes(a.departure_time) - timeToMinutes(b.departure_time);
    })[0];

    // 5. BEST: scoring
    const maxPrice = Math.max(...options.map(o => o.price));
    const maxDuration = Math.max(...options.map(o => o.duration));
    const comfortScores: Record<string, number> = { low: 0.3, medium: 0.6, high: 1 };

    const calculateBestScore = (o: any) => {
      const normalizedPrice = o.price / maxPrice;
      const normalizedDuration = o.duration / maxDuration;
      const comfortScore = comfortScores[o.comfort] || 0.3;
      return (normalizedPrice * 0.4) + (normalizedDuration * 0.4) + (comfortScore * 0.2);
    };

    const best = [...options].sort((a, b) => compareOptions(a, b, calculateBestScore))[0];

    res.json({
      fastest,
      cheapest,
      premium,
      eco,
      best
    });
  });

  // Catch-all for API routes
  app.all("/api/*", (req, res) => {
    console.warn(`[API 404] ${req.method} ${req.url}`);
    res.status(404).json({ error: "API route not found" });
  });

  // Global Error Handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("[SERVER ERROR]", err);
    res.status(500).json({ 
      error: "Internal Server Error", 
      message: err.message,
      path: req.url
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
