const CITY_COORDINATES = {
  bangalore: { lat: 12.9716, lng: 77.5946, city: "Bangalore", country: "India" },
  bengaluru: { lat: 12.9716, lng: 77.5946, city: "Bangalore", country: "India" },
  kolkata: { lat: 22.5726, lng: 88.3639, city: "Kolkata", country: "India" },
  delhi: { lat: 28.6139, lng: 77.209, city: "Delhi NCR", country: "India" },
  "new delhi": { lat: 28.6139, lng: 77.209, city: "Delhi NCR", country: "India" },
  "delhi ncr": { lat: 28.6139, lng: 77.209, city: "Delhi NCR", country: "India" },
  noida: { lat: 28.5355, lng: 77.391, city: "Noida", country: "India" },
  gurgaon: { lat: 28.4595, lng: 77.0266, city: "Gurgaon", country: "India" },
  gurugram: { lat: 28.4595, lng: 77.0266, city: "Gurgaon", country: "India" },
  mumbai: { lat: 19.076, lng: 72.8777, city: "Mumbai", country: "India" },
  pune: { lat: 18.5204, lng: 73.8567, city: "Pune", country: "India" },
  hyderabad: { lat: 17.385, lng: 78.4867, city: "Hyderabad", country: "India" },
  chennai: { lat: 13.0827, lng: 80.2707, city: "Chennai", country: "India" },
  ahmedabad: { lat: 23.0225, lng: 72.5714, city: "Ahmedabad", country: "India" },
  jaipur: { lat: 26.9124, lng: 75.7873, city: "Jaipur", country: "India" },
  chandigarh: { lat: 30.7333, lng: 76.7794, city: "Chandigarh", country: "India" },
  lucknow: { lat: 26.8467, lng: 80.9462, city: "Lucknow", country: "India" },
  indore: { lat: 22.7196, lng: 75.8577, city: "Indore", country: "India" },
  kochi: { lat: 9.9312, lng: 76.2673, city: "Kochi", country: "India" },
  goa: { lat: 15.2993, lng: 74.124, city: "Goa", country: "India" },
  "san francisco": { lat: 37.7749, lng: -122.4194, city: "San Francisco", country: "United States" },
  london: { lat: 51.5074, lng: -0.1278, city: "London", country: "United Kingdom" },
  newyork: { lat: 40.7128, lng: -74.006, city: "New York", country: "United States" },
  "new york": { lat: 40.7128, lng: -74.006, city: "New York", country: "United States" },
  singapore: { lat: 1.3521, lng: 103.8198, city: "Singapore", country: "Singapore" },
  dubai: { lat: 25.2048, lng: 55.2708, city: "Dubai", country: "United Arab Emirates" },
};

export function coordinatesFromAddress(addressStr) {
  if (!addressStr || typeof addressStr !== "string") {
    return { lat: 12.9716, lng: 77.5946, city: "Bangalore", country: "India" };
  }
  const clean = addressStr.toLowerCase();
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (clean.includes(key)) return { ...coords };
  }
  return { lat: 12.9716, lng: 77.5946, city: "Bangalore", country: "India" };
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every((value) => Number.isFinite(Number(value)))) return null;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
