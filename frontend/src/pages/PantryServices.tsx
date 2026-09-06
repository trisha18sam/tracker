import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth, PantryOrderRecord } from '../context/AuthContext';
import { DataBadge } from '../components/DataBadge';

interface FoodItem {
  id: string;
  name: string;
  category: 'BREAKFAST' | 'MEALS' | 'SNACKS' | 'BEVERAGES';
  diet: 'VEG' | 'NON_VEG' | 'JAIN';
  price: number;
  price_source: 'IRCTC_OFFICIAL_TARIFF' | 'VENDOR_DEMO';
  official_tariff_ref?: string;
  vendor_name?: string;
  description: string;
  imageIcon: string;
  calories: string;
  is_available?: boolean;
}

export const PantryServices: React.FC = () => {
  const { user, openAuthModal, addPantryOrder } = useAuth();

  const [selectedTrain, setSelectedTrain] = useState('12952 Mumbai Rajdhani Express');
  const [deliveryStation, setDeliveryStation] = useState('Kanpur Central (CNB)');
  const [coachCode, setCoachCode] = useState('B2');
  const [seatNumber, setSeatNumber] = useState(18);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Cart state: item_id -> quantity
  const [cart, setCart] = useState<Record<string, number>>({});
  const [confirmedOrder, setConfirmedOrder] = useState<PantryOrderRecord | null>(null);
  const [tariffSource, setTariffSource] = useState<string>(
    'Railway Board Commercial Circular No. 60 of 2019 / IRCTC Catering Policy'
  );
  const [loadingMenu, setLoadingMenu] = useState<boolean>(true);

  // Baseline items compliant with Railway Board Statutory Circular 60/2019
  const baselineMenu: FoodItem[] = [
    {
      id: 'rn1',
      name: 'Rail Neer Packaged Drinking Water (1 Litre)',
      category: 'BEVERAGES',
      diet: 'VEG',
      price: 15,
      price_source: 'IRCTC_OFFICIAL_TARIFF',
      official_tariff_ref: 'Railway Board Circular 60/2019 (MRP fixed at ₹15.00)',
      vendor_name: 'IRCTC Official',
      description: 'Chilled 1 Litre packaged drinking water processed to Bureau of Indian Standards (IS 14543).',
      imageIcon: '💧',
      calories: '0 kcal',
      is_available: true,
    },
    {
      id: 'm1',
      name: 'Standard Vegetarian Meal (Thali)',
      category: 'MEALS',
      diet: 'VEG',
      price: 80,
      price_source: 'IRCTC_OFFICIAL_TARIFF',
      official_tariff_ref: 'Railway Board Circular 60/2019 (Standard Meal Tariff)',
      vendor_name: 'IRCTC Departmental Catering',
      description: 'Rice, Dal, Paneer/Veg Curry, 2 Parathas/4 Rotis, Curd & Pickle in hygienic aluminum casserole.',
      imageIcon: '🍱',
      calories: '650 kcal',
      is_available: true,
    },
    {
      id: 'm2',
      name: 'Standard Non-Vegetarian Meal',
      category: 'MEALS',
      diet: 'NON_VEG',
      price: 90,
      price_source: 'IRCTC_OFFICIAL_TARIFF',
      official_tariff_ref: 'Railway Board Circular 60/2019 (Standard Non-Veg Meal)',
      vendor_name: 'IRCTC Departmental Catering',
      description: 'Egg Curry (2 Eggs) or Chicken Curry with Steamed Rice, Dal, 2 Parathas & Pickle.',
      imageIcon: '🍗',
      calories: '720 kcal',
      is_available: true,
    },
    {
      id: 'b1',
      name: 'Standard Vegetarian Breakfast',
      category: 'BREAKFAST',
      diet: 'VEG',
      price: 40,
      price_source: 'IRCTC_OFFICIAL_TARIFF',
      official_tariff_ref: 'Railway Board Circular 60/2019',
      vendor_name: 'IRCTC Departmental Catering',
      description: '2 Stuffed Parathas with Curd/Pickle or 4 Idlis with Sambhar and Chutney.',
      imageIcon: '🥞',
      calories: '380 kcal',
      is_available: true,
    },
    {
      id: 'b2',
      name: 'Standard Bread Omelette (2 Eggs)',
      category: 'BREAKFAST',
      diet: 'NON_VEG',
      price: 50,
      price_source: 'IRCTC_OFFICIAL_TARIFF',
      official_tariff_ref: 'Railway Board Circular 60/2019',
      vendor_name: 'IRCTC Departmental Catering',
      description: '2 Egg plain omelette with 2 slices of bread and butter/ketchup.',
      imageIcon: '🍳',
      calories: '420 kcal',
      is_available: true,
    },
    {
      id: 'd1',
      name: 'Standard Rail Tea (Dip Dip with Cup)',
      category: 'BEVERAGES',
      diet: 'VEG',
      price: 10,
      price_source: 'IRCTC_OFFICIAL_TARIFF',
      official_tariff_ref: 'Railway Board Circular 60/2019 (MRP fixed at ₹10.00)',
      vendor_name: 'IRCTC Authorized Vendors',
      description: 'Standard 150ml tea prepared with dip tea bag, sugar sachet, and sterilized cup.',
      imageIcon: '☕',
      calories: '60 kcal',
      is_available: true,
    },
    {
      id: 'd2',
      name: 'Standard Coffee with Milk',
      category: 'BEVERAGES',
      diet: 'VEG',
      price: 15,
      price_source: 'IRCTC_OFFICIAL_TARIFF',
      official_tariff_ref: 'Railway Board Circular 60/2019',
      vendor_name: 'IRCTC Authorized Vendors',
      description: 'Hot instant coffee with milk and sugar in 150ml cup.',
      imageIcon: '☕',
      calories: '90 kcal',
      is_available: true,
    },
    {
      id: 's1',
      name: 'Janta Khana (Economy Meal Box)',
      category: 'MEALS',
      diet: 'VEG',
      price: 20,
      price_source: 'IRCTC_OFFICIAL_TARIFF',
      official_tariff_ref: 'Railway Board Mandatory Affordable Meal Scheme',
      vendor_name: 'IRCTC Jan Aahar',
      description: '7 Puris (175g), Aloo dry curry (150g) and pickle packet.',
      imageIcon: '🍱',
      calories: '550 kcal',
      is_available: true,
    },
    {
      id: 's2',
      name: 'Samosa (2 pcs with Chutney)',
      category: 'SNACKS',
      diet: 'VEG',
      price: 30,
      price_source: 'IRCTC_OFFICIAL_TARIFF',
      official_tariff_ref: 'IRCTC Approved Station Stall Tariff',
      vendor_name: 'IRCTC Station Stalls',
      description: 'Crispy potato stuffed samosas served with sweet tamarind and spicy mint chutney.',
      imageIcon: '🥟',
      calories: '310 kcal',
      is_available: true,
    },
    {
      id: 'v1',
      name: 'Maharaja Executive Deluxe Thali',
      category: 'MEALS',
      diet: 'VEG',
      price: 240,
      price_source: 'VENDOR_DEMO',
      official_tariff_ref: 'Vendor Gourmet Speciality (Market Tariff)',
      vendor_name: 'Haldiram Express / Comesum',
      description: 'Paneer Butter Masala, Dal Makhani, Jeera Rice, 3 Butter Rotis, Gulab Jamun, Curd & Salad.',
      imageIcon: '🍱',
      calories: '780 kcal',
      is_available: true,
    },
    {
      id: 'v2',
      name: 'Hyderabadi Dum Chicken Biryani',
      category: 'MEALS',
      diet: 'NON_VEG',
      price: 280,
      price_source: 'VENDOR_DEMO',
      official_tariff_ref: 'Vendor Gourmet Speciality (Market Tariff)',
      vendor_name: 'Paradise Biryani Express',
      description: 'Aromatic basmati rice layered with spiced chicken, served with Mirchi ka Salan & Raita.',
      imageIcon: '🍗',
      calories: '850 kcal',
      is_available: true,
    },
    {
      id: 'v3',
      name: 'Chilled Sweet Lassi / Butter Milk',
      category: 'BEVERAGES',
      diet: 'VEG',
      price: 45,
      price_source: 'VENDOR_DEMO',
      official_tariff_ref: 'Vendor Special Beverage',
      vendor_name: 'Amul / Mother Dairy Kiosk',
      description: 'Creamy churned yogurt drink garnished with cardamom and saffron strands.',
      imageIcon: '🥛',
      calories: '180 kcal',
      is_available: true,
    },
  ];

  const [menu, setMenu] = useState<FoodItem[]>(baselineMenu);

  useEffect(() => {
    api.getPantryMenu()
      .then(res => {
        if (res && res.items && res.items.length > 0) {
          const mapped: FoodItem[] = res.items.map((item: any) => ({
            id: String(item.id),
            name: item.name,
            category: (item.category as any) || 'MEALS',
            diet: (item.diet_type as any) || 'VEG',
            price: item.price,
            price_source: item.price_source,
            official_tariff_ref: item.official_tariff_ref,
            vendor_name: item.vendor_name,
            description: item.official_tariff_ref
              ? `${item.official_tariff_ref}. Freshly prepared under IRCTC catering guidelines.`
              : 'Special culinary preparation delivered hot to your coach.',
            imageIcon: item.category === 'BEVERAGES' ? (item.name.toLowerCase().includes('water') ? '💧' : '☕') :
                       item.category === 'BREAKFAST' ? '🥞' :
                       item.category === 'SNACKS' ? '🥟' : '🍱',
            calories: item.category === 'BEVERAGES' ? '0-110 kcal' : '350-750 kcal',
            is_available: item.is_available,
          }));
          setMenu(mapped);
          if (res.official_tariff_source) {
            setTariffSource(res.official_tariff_source);
          }
        }
        setLoadingMenu(false);
      })
      .catch(() => setLoadingMenu(false));
  }, []);

  const filteredMenu = selectedCategory === 'ALL'
    ? menu
    : menu.filter((item) => item.category === selectedCategory);

  const addToCart = (id: string) => {
    setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => {
      const next = { ...prev };
      if (next[id] > 1) {
        next[id] -= 1;
      } else {
        delete next[id];
      }
      return next;
    });
  };

  const cartItems = Object.entries(cart)
    .map(([id, qty]) => {
      const item = menu.find((m) => m.id === id);
      return item ? { ...item, qty } : null;
    })
    .filter(Boolean) as (FoodItem & { qty: number })[];

  const cartTotal = cartItems.reduce((acc, curr) => acc + curr.price * curr.qty, 0);

  const executeOrder = async () => {
    if (cartItems.length === 0) return;

    try {
      await api.createPantryOrder({
        train_number: selectedTrain.split(' ')[0],
        train_name: selectedTrain,
        coach_code: coachCode,
        seat_number: seatNumber,
        delivery_station: deliveryStation,
        items: cartItems.map((c) => ({
          name: c.name,
          quantity: c.qty,
          price: c.price,
          price_source: c.price_source,
        })),
        total_amount: cartTotal,
      });
    } catch (e) {
      console.warn('Backend order recording note:', e);
    }

    const order = addPantryOrder({
      trainNumber: selectedTrain.split(' ')[0],
      trainName: selectedTrain,
      coachCode,
      seatNumber,
      deliveryStation,
      items: cartItems.map((c) => ({ name: c.name, quantity: c.qty, price: c.price })),
      totalAmount: cartTotal,
    });
    setConfirmedOrder(order);
    setCart({});
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) return;

    if (!user.authenticated) {
      // Trigger context-aware authentication guard and execute order automatically upon login
      openAuthModal({
        title: 'Sign in to place your order',
        subtitle: 'Enter your details to receive delivery at your berth.',
        buttonText: 'Confirm & Place Order',
        contextMessage: `Sign in to confirm your ₹${cartTotal} meal order delivered to Coach ${coachCode}, Seat #${seatNumber} at ${deliveryStation.split(' ·')[0]}.`,
        onSuccess: () => {
          executeOrder();
        },
      });
    } else {
      executeOrder();
    }
  };

  return (
    <div className="page-container">
      {/* Header Banner */}
      <div
        className="card mb-4"
        style={{
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 23, 42, 0.9) 100%)',
          borderColor: 'rgba(245, 158, 11, 0.35)',
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <span
            className="badge"
            style={{
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#f59e0b',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              fontSize: '0.75rem',
            }}
          >
            🍱 IRCTC ON-BOARD PANTRY & CATERING SERVICES
          </span>
          <span className="text-xs text-muted">
            Explore Menus Freely · Authentication Required on Checkout
          </span>
        </div>

        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: 4 }}>
          Pantry Services & <span style={{ color: '#f59e0b' }}>Seat Delivery</span>
        </h1>
        <p className="text-secondary" style={{ marginTop: 4, maxWidth: 850 }}>
          Order hygienic, freshly prepared meals and beverages delivered directly to your berth at designated intermediate stoppage stations.
        </p>

        {/* Delivery Details Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 10,
            marginTop: 14,
          }}
        >
          <div>
            <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
              Select Train Rake:
            </label>
            <select
              value={selectedTrain}
              onChange={(e) => setSelectedTrain(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                padding: '6px 10px',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
              }}
            >
              <option value="12952 Mumbai Rajdhani Express">12952 Mumbai Rajdhani Express</option>
              <option value="12004 Lucknow Shatabdi Express">12004 Lucknow Shatabdi Express</option>
              <option value="22436 Vande Bharat Express">22436 Vande Bharat Express</option>
              <option value="12301 Howrah Rajdhani Express">12301 Howrah Rajdhani Express</option>
              <option value="12626 Kerala Express">12626 Kerala Express</option>
              <option value="12957 Ahmedabad Rajdhani">12957 Ahmedabad Rajdhani</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
              Delivery Station:
            </label>
            <select
              value={deliveryStation}
              onChange={(e) => setDeliveryStation(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                padding: '6px 10px',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
              }}
            >
              <option value="Kanpur Central (CNB)">Kanpur Central (CNB) · ETA 11:20</option>
              <option value="Kota Junction (KOTA)">Kota Junction (KOTA) · ETA 21:05</option>
              <option value="Lucknow Charbagh (LKO)">Lucknow Charbagh (LKO) · ETA 12:40</option>
              <option value="Varanasi Junction (BSB)">Varanasi Junction (BSB) · ETA 14:00</option>
              <option value="Jaipur Junction (JP)">Jaipur Junction (JP) · ETA 20:15</option>
              <option value="Ratlam Junction (RTM)">Ratlam Junction (RTM) · ETA 00:15</option>
              <option value="Vadodara Junction (BRC)">Vadodara Junction (BRC) · ETA 03:50</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div>
              <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
                Coach:
              </label>
              <input
                type="text"
                value={coachCode}
                onChange={(e) => setCoachCode(e.target.value.toUpperCase())}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  padding: '6px 10px',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>
            <div>
              <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
                Berth #:
              </label>
              <input
                type="number"
                value={seatNumber}
                onChange={(e) => setSeatNumber(Number(e.target.value))}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  padding: '6px 10px',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Statutory Tariff Compliance Card */}
      <div
        className="card mb-4"
        style={{
          background: 'rgba(6, 182, 212, 0.08)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          padding: '12px 16px',
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <DataBadge sourceType="IRCTC_OFFICIAL_TARIFF" label="GOVERNMENT NOTIFIED RATES" />
            <span className="text-xs font-bold" style={{ color: '#22d3ee' }}>
              Statutory Compliance: {tariffSource}
            </span>
          </div>
          <span className="text-xs text-muted mono">
            MRP Protection · Zero Overcharging Guarantee
          </span>
        </div>
        <p className="text-xs text-secondary mt-1" style={{ margin: '4px 0 0', lineHeight: 1.4 }}>
          Statutory ceiling tariffs (Rail Neer 1L @ ₹15, Standard Veg Meal @ ₹80, Standard Non-Veg Meal @ ₹90, Tea @ ₹10) strictly conform to Railway Board directives. Authorized vendor specialities are designated with demonstration badges.
        </p>
      </div>

      {/* Main Grid: Menu Catalog & Live Cart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        
        {/* Left: Menu Catalog */}
        <div>
          {/* Category Tabs */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {[
              { key: 'ALL', label: 'All Items' },
              { key: 'MEALS', label: '🍱 Thalis & Main Meals' },
              { key: 'BREAKFAST', label: '🥞 Morning Breakfast' },
              { key: 'SNACKS', label: '🥪 Snacks & Quick Bites' },
              { key: 'BEVERAGES', label: '☕ Hot & Cold Beverages' },
            ].map((tab) => (
              <button
                key={tab.key}
                className={`btn btn-sm ${selectedCategory === tab.key ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                onClick={() => setSelectedCategory(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Menu Items Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {filteredMenu.map((item) => (
              <div
                key={item.id}
                className="card"
                style={{
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border-default)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: 14,
                }}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span style={{ fontSize: '1.4rem' }}>{item.imageIcon}</span>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '1px 5px',
                        borderRadius: 3,
                        fontWeight: 700,
                        border: '1px solid',
                        borderColor: item.diet === 'VEG' ? '#10b981' : item.diet === 'JAIN' ? '#f59e0b' : '#ef4444',
                        color: item.diet === 'VEG' ? '#10b981' : item.diet === 'JAIN' ? '#f59e0b' : '#ef4444',
                        background: 'var(--bg-canvas)',
                      }}
                    >
                      {item.diet === 'VEG' ? '🟢 PURE VEG' : item.diet === 'JAIN' ? '🟡 JAIN SATVIK' : '🔴 NON-VEG'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 mt-1 mb-1">
                    <DataBadge
                      sourceType={item.price_source}
                      label={item.price_source === 'IRCTC_OFFICIAL_TARIFF' ? 'IRCTC TARIFF' : 'VENDOR SPECIAL'}
                    />
                  </div>

                  <h3 style={{ fontSize: '0.95rem', color: '#f1f5f9', marginTop: 4 }}>
                    {item.name}
                  </h3>

                  {item.official_tariff_ref && (
                    <div className="text-xs text-muted mono" style={{ fontSize: '0.66rem', color: '#06b6d4', marginTop: 2 }}>
                      {item.official_tariff_ref}
                    </div>
                  )}

                  {item.vendor_name && (
                    <div className="text-xs text-muted" style={{ fontSize: '0.68rem', marginTop: 1 }}>
                      Provider: {item.vendor_name}
                    </div>
                  )}

                  <p className="text-muted text-xs" style={{ marginTop: 4, minHeight: 34, lineHeight: 1.3 }}>
                    {item.description}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 mt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <div>
                    <span className="mono font-bold" style={{ fontSize: '1.1rem', color: '#f1f5f9' }}>
                      ₹{item.price}
                    </span>
                    <span className="text-muted text-xs ml-1" style={{ fontSize: '0.68rem' }}>
                      ({item.calories})
                    </span>
                  </div>

                  {cart[item.id] ? (
                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-sm btn-secondary"
                        style={{ padding: '2px 8px', fontSize: '0.9rem', lineHeight: 1 }}
                        onClick={() => removeFromCart(item.id)}
                      >
                        -
                      </button>
                      <span className="mono font-bold" style={{ fontSize: '0.88rem' }}>{cart[item.id]}</span>
                      <button
                        className="btn btn-sm btn-primary"
                        style={{ padding: '2px 8px', fontSize: '0.9rem', lineHeight: 1 }}
                        onClick={() => addToCart(item.id)}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-sm btn-primary"
                      style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                      onClick={() => addToCart(item.id)}
                    >
                      + Add
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Live Cart & Guarded Checkout */}
        <div>
          <div
            className="card"
            style={{
              background: 'var(--bg-panel-elevated)',
              border: '1px solid var(--border-strong)',
              padding: 16,
              position: 'sticky',
              top: 20,
            }}
          >
            <div className="flex items-center justify-between pb-2 mb-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
              <h3 style={{ fontSize: '1rem', color: '#f1f5f9' }}>
                🛒 Berth Delivery Cart ({cartItems.length})
              </h3>
              <span className="mono text-xs text-muted">
                Coach {coachCode} · Seat {seatNumber}
              </span>
            </div>

            {cartItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-disabled)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 6 }}>🍱</div>
                <div className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
                  Your cart is empty
                </div>
                <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                  Browse menus above and add items to receive delivery at {deliveryStation}.
                </p>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto', marginBottom: 12 }}>
                  {cartItems.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between"
                      style={{
                        padding: '6px 8px',
                        background: 'var(--bg-canvas)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.78rem',
                      }}
                    >
                      <div>
                        <div className="font-bold" style={{ color: '#f1f5f9' }}>{c.name}</div>
                        <div className="text-muted text-xs">
                          ₹{c.price} × {c.qty} = <span className="mono font-bold text-white">₹{c.price * c.qty}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          className="btn btn-sm btn-secondary"
                          style={{ padding: '1px 6px', fontSize: '0.8rem', lineHeight: 1 }}
                          onClick={() => removeFromCart(c.id)}
                        >
                          -
                        </button>
                        <span className="mono font-bold">{c.qty}</span>
                        <button
                          className="btn btn-sm btn-secondary"
                          style={{ padding: '1px 6px', fontSize: '0.8rem', lineHeight: 1 }}
                          onClick={() => addToCart(c.id)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 mb-3" style={{ borderTop: '1px solid var(--border-default)' }}>
                  <div className="flex items-center justify-between text-xs text-muted mb-1">
                    <span>Delivery Station:</span>
                    <strong className="text-white">{deliveryStation.split(' ·')[0]}</strong>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted mb-1">
                    <span>Berth Location:</span>
                    <strong className="text-white">Coach {coachCode}, Seat #{seatNumber}</strong>
                  </div>
                  <div className="flex items-center justify-between font-bold text-sm mt-2 pt-2" style={{ borderTop: '1px dashed var(--border-default)' }}>
                    <span>Total Payable:</span>
                    <span className="mono" style={{ fontSize: '1.25rem', color: '#10b981' }}>
                      ₹{cartTotal}
                    </span>
                  </div>
                </div>

                <button
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    borderColor: '#f59e0b',
                    color: '#000',
                  }}
                  onClick={handleCheckout}
                >
                  {user.authenticated ? '⚡ Confirm & Place Order' : '🔒 Sign in & Place Order'}
                </button>

                {!user.authenticated && (
                  <p className="text-muted text-xs text-center mt-2" style={{ fontSize: '0.7rem' }}>
                    Quick sign-in required on checkout for order tracking.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Confirmed Order Confirmation Modal */}
      {confirmedOrder && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            className="card animate-fadeIn"
            style={{
              width: '100%',
              maxWidth: 440,
              background: 'var(--bg-panel)',
              borderColor: '#10b981',
              padding: 24,
            }}
          >
            <div className="text-center pb-3 mb-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 4 }}>✅</div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981' }}>
                Pantry Order Confirmed!
              </h2>
              <p className="text-muted text-xs mt-1">
                Order #{confirmedOrder.orderNumber} placed successfully.
              </p>
            </div>

            <div style={{ background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', padding: 12, marginBottom: 14 }}>
              <div className="flex items-center justify-between text-xs text-muted mb-1">
                <span>Train:</span>
                <strong className="text-white">{confirmedOrder.trainName}</strong>
              </div>
              <div className="flex items-center justify-between text-xs text-muted mb-1">
                <span>Delivery At:</span>
                <strong className="text-white">{confirmedOrder.deliveryStation}</strong>
              </div>
              <div className="flex items-center justify-between text-xs text-muted mb-1">
                <span>Berth:</span>
                <strong className="text-white">Coach {confirmedOrder.coachCode}, Seat #{confirmedOrder.seatNumber}</strong>
              </div>
              <div className="flex items-center justify-between text-xs text-muted mb-1">
                <span>Items:</span>
                <strong className="text-white">{confirmedOrder.items.map(i => `${i.name} (${i.quantity})`).join(', ')}</strong>
              </div>
              <div className="flex items-center justify-between font-bold text-sm pt-2 mt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <span>Amount Paid:</span>
                <span className="mono" style={{ color: '#10b981' }}>₹{confirmedOrder.totalAmount}</span>
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '9px 12px', fontWeight: 700 }}
              onClick={() => setConfirmedOrder(null)}
            >
              Done & View Tracking
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
