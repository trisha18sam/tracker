import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface BookingRecord {
  id: string;
  pnr: string;
  trainNumber: string;
  trainName: string;
  fromStation: string;
  toStation: string;
  date: string;
  coachClass: string;
  coachCode: string;
  seatNumber: number;
  berthType: string;
  amountPaid: number;
  status: 'CONFIRMED' | 'CANCELLED';
  bookedAt: string;
}

export interface PantryOrderRecord {
  id: string;
  orderNumber: string;
  trainNumber: string;
  trainName: string;
  coachCode: string;
  seatNumber: number;
  deliveryStation: string;
  items: { name: string; quantity: number; price: number }[];
  totalAmount: number;
  status: 'PREPARING' | 'DELIVERED';
  orderedAt: string;
}

export interface ActiveJourney {
  trainNumber: string;
  trainName: string;
  sourceCode: string;
  sourceName: string;
  destCode: string;
  destName: string;
  travelDate?: string;
  travelClass?: string;
  fare?: number;
  fareSource?: string;
  pnr?: string;
  coach?: string;
  seatNumber?: number | string;
  berthType?: string;
}

export interface UserProfile {
  authenticated: boolean;
  guest: boolean;
  name?: string;
  email?: string;
  mobile?: string;
  savedTrains: number[];
  bookings: BookingRecord[];
  pantryOrders: PantryOrderRecord[];
  recentSearches: string[];
}

export interface OpenAuthModalOptions {
  title?: string;
  subtitle?: string;
  contextMessage?: string;
  buttonText?: string;
  onSuccess?: () => void;
}

interface AuthContextType {
  user: UserProfile;
  login: (email: string, mobile: string, name?: string) => void;
  logout: () => void;
  saveTrain: (trainId: number) => void;
  removeSavedTrain: (trainId: number) => void;
  addBooking: (booking: Omit<BookingRecord, 'id' | 'pnr' | 'bookedAt' | 'status'>) => BookingRecord;
  addPantryOrder: (order: Omit<PantryOrderRecord, 'id' | 'orderNumber' | 'orderedAt' | 'status'>) => PantryOrderRecord;
  addRecentSearch: (query: string) => void;
  // Journey state
  currentJourney: ActiveJourney | null;
  setCurrentJourney: (journey: ActiveJourney | null) => void;
  clearJourney: () => void;
  pendingBookingData: any | null;
  setPendingBookingData: (data: any | null) => void;
  // Context-aware guard helpers
  authModalOpen: boolean;
  authTitle: string;
  authSubtitle: string;
  authButtonText: string;
  authContextMessage: string;
  openAuthModal: (
    optionsOrMessage: string | OpenAuthModalOptions,
    legacyCallback?: () => void
  ) => void;
  closeAuthModal: () => void;
  onAuthSuccess?: () => void;
}

const GUEST_DEFAULT: UserProfile = {
  authenticated: false,
  guest: true,
  savedTrains: [12952],
  bookings: [],
  pantryOrders: [],
  recentSearches: ['12952 Mumbai Rajdhani', '12957 Swarna Jayanti', 'New Delhi ➔ Jaipur'],
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'trackiq_user_session';
const JOURNEY_STORAGE_KEY = 'trackiq_active_journey';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile>(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...GUEST_DEFAULT, ...parsed };
      }
    } catch (_) {}
    return GUEST_DEFAULT;
  });

  const [currentJourney, setCurrentJourneyState] = useState<ActiveJourney | null>(() => {
    try {
      const stored = localStorage.getItem(JOURNEY_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (_) {}
    return null;
  });

  const [pendingBookingData, setPendingBookingData] = useState<any | null>(null);

  const setCurrentJourney = (journey: ActiveJourney | null) => {
    setCurrentJourneyState(journey);
    try {
      if (journey) {
        localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(journey));
      } else {
        localStorage.removeItem(JOURNEY_STORAGE_KEY);
      }
    } catch (_) {}
  };

  const clearJourney = () => {
    setCurrentJourney(null);
  };

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTitle, setAuthTitle] = useState('Almost there.');
  const [authSubtitle, setAuthSubtitle] = useState('Enter your details to continue.');
  const [authButtonText, setAuthButtonText] = useState('Continue');
  const [authContextMessage, setAuthContextMessage] = useState('');
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);

  // Sync to local storage
  useEffect(() => {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } catch (_) {}
  }, [user]);

  const login = (email: string, mobile: string, name?: string) => {
    const formattedName = name || (email.split('@')[0].replace(/[._]/g, ' ') || 'Passenger');
    setUser((prev) => ({
      ...prev,
      authenticated: true,
      guest: false,
      email: email.trim(),
      mobile: mobile.trim(),
      name: formattedName.charAt(0).toUpperCase() + formattedName.slice(1),
    }));
    setAuthModalOpen(false);

    if (pendingCallback) {
      const cb = pendingCallback;
      setPendingCallback(null);
      cb();
    }
  };

  const logout = () => {
    setUser({
      ...GUEST_DEFAULT,
      authenticated: false,
      guest: true,
      name: undefined,
      email: undefined,
      mobile: undefined,
    });
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const saveTrain = (trainId: number) => {
    setUser((prev) => {
      if (prev.savedTrains.includes(trainId)) return prev;
      return { ...prev, savedTrains: [...prev.savedTrains, trainId] };
    });
  };

  const removeSavedTrain = (trainId: number) => {
    setUser((prev) => ({
      ...prev,
      savedTrains: prev.savedTrains.filter((id) => id !== trainId),
    }));
  };

  const addBooking = (booking: Omit<BookingRecord, 'id' | 'pnr' | 'bookedAt' | 'status'>): BookingRecord => {
    const pnr = `PNR-${Math.floor(1000000 + Math.random() * 9000000)}`;
    const newRecord: BookingRecord = {
      ...booking,
      id: `BK-${Date.now()}`,
      pnr,
      bookedAt: new Date().toISOString(),
      status: 'CONFIRMED',
    };

    setUser((prev) => ({
      ...prev,
      bookings: [newRecord, ...prev.bookings],
    }));

    // Auto-sync current active journey
    setCurrentJourney({
      trainNumber: booking.trainNumber,
      trainName: booking.trainName,
      sourceCode: booking.fromStation,
      sourceName: booking.fromStation,
      destCode: booking.toStation,
      destName: booking.toStation,
      travelDate: booking.date,
      travelClass: booking.coachClass,
      fare: booking.amountPaid,
      fareSource: 'IR Telescopic Tariff',
      pnr,
      coach: booking.coachCode,
      seatNumber: booking.seatNumber,
      berthType: booking.berthType,
    });

    return newRecord;
  };

  const addPantryOrder = (order: Omit<PantryOrderRecord, 'id' | 'orderNumber' | 'orderedAt' | 'status'>): PantryOrderRecord => {
    const orderNumber = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const newOrder: PantryOrderRecord = {
      ...order,
      id: `PO-${Date.now()}`,
      orderNumber,
      orderedAt: new Date().toISOString(),
      status: 'PREPARING',
    };

    setUser((prev) => ({
      ...prev,
      pantryOrders: [newOrder, ...prev.pantryOrders],
    }));
    return newOrder;
  };

  const addRecentSearch = (query: string) => {
    if (!query.trim()) return;
    setUser((prev) => {
      const filtered = prev.recentSearches.filter((q) => q.toLowerCase() !== query.toLowerCase());
      return {
        ...prev,
        recentSearches: [query.trim(), ...filtered].slice(0, 6),
      };
    });
  };

  const openAuthModal = (
    optionsOrMessage: string | OpenAuthModalOptions,
    legacyCallback?: () => void
  ) => {
    if (typeof optionsOrMessage === 'string') {
      // Legacy signature: openAuthModal(contextMessage, callback)
      setAuthTitle('Almost there.');
      setAuthSubtitle('Enter your details to continue.');
      setAuthButtonText('Continue');
      setAuthContextMessage(optionsOrMessage);
      setPendingCallback(legacyCallback ? () => legacyCallback : null);
    } else {
      // Object signature
      setAuthTitle(optionsOrMessage.title || 'Almost there.');
      setAuthSubtitle(optionsOrMessage.subtitle || 'Enter your details to continue.');
      setAuthButtonText(optionsOrMessage.buttonText || 'Continue');
      setAuthContextMessage(optionsOrMessage.contextMessage || '');
      setPendingCallback(optionsOrMessage.onSuccess ? () => optionsOrMessage.onSuccess! : null);
    }
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
    setPendingCallback(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        saveTrain,
        removeSavedTrain,
        addBooking,
        addPantryOrder,
        addRecentSearch,
        currentJourney,
        setCurrentJourney,
        clearJourney,
        pendingBookingData,
        setPendingBookingData,
        authModalOpen,
        authTitle,
        authSubtitle,
        authButtonText,
        authContextMessage,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
