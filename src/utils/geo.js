const CITY_COORDINATES = {
  bangalore: {
    lat: 12.9716,
    lng: 77.5946,
    city: "Bangalore",
    state: "Karnataka",
    country: "India",
  },
  bengaluru: {
    lat: 12.9716,
    lng: 77.5946,
    city: "Bangalore",
    state: "Karnataka",
    country: "India",
  },
  kolkata: {
    lat: 22.5726,
    lng: 88.3639,
    city: "Kolkata",
    state: "West Bengal",
    country: "India",
  },
  delhi: {
    lat: 28.6139,
    lng: 77.209,
    city: "Delhi NCR",
    state: "Delhi",
    country: "India",
  },
  "new delhi": {
    lat: 28.6139,
    lng: 77.209,
    city: "Delhi NCR",
    state: "Delhi",
    country: "India",
  },
  "delhi ncr": {
    lat: 28.6139,
    lng: 77.209,
    city: "Delhi NCR",
    state: "Delhi",
    country: "India",
  },
  noida: {
    lat: 28.5355,
    lng: 77.391,
    city: "Noida",
    state: "Uttar Pradesh",
    country: "India",
  },
  gurgaon: {
    lat: 28.4595,
    lng: 77.0266,
    city: "Gurgaon",
    state: "Haryana",
    country: "India",
  },
  gurugram: {
    lat: 28.4595,
    lng: 77.0266,
    city: "Gurgaon",
    state: "Haryana",
    country: "India",
  },
  mumbai: {
    lat: 19.076,
    lng: 72.8777,
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  },
  pune: {
    lat: 18.5204,
    lng: 73.8567,
    city: "Pune",
    state: "Maharashtra",
    country: "India",
  },
  hyderabad: {
    lat: 17.385,
    lng: 78.4867,
    city: "Hyderabad",
    state: "Telangana",
    country: "India",
  },
  chennai: {
    lat: 13.0827,
    lng: 80.2707,
    city: "Chennai",
    state: "Tamil Nadu",
    country: "India",
  },
  ahmedabad: {
    lat: 23.0225,
    lng: 72.5714,
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
  },
  jaipur: {
    lat: 26.9124,
    lng: 75.7873,
    city: "Jaipur",
    state: "Rajasthan",
    country: "India",
  },
  chandigarh: {
    lat: 30.7333,
    lng: 76.7794,
    city: "Chandigarh",
    state: "Chandigarh",
    country: "India",
  },
  lucknow: {
    lat: 26.8467,
    lng: 80.9462,
    city: "Lucknow",
    state: "Uttar Pradesh",
    country: "India",
  },
  indore: {
    lat: 22.7196,
    lng: 75.8577,
    city: "Indore",
    state: "Madhya Pradesh",
    country: "India",
  },
  kochi: {
    lat: 9.9312,
    lng: 76.2673,
    city: "Kochi",
    state: "Kerala",
    country: "India",
  },
  goa: {
    lat: 15.2993,
    lng: 74.124,
    city: "Goa",
    state: "Goa",
    country: "India",
  },
  "west bengal": {
    lat: 22.9868,
    lng: 87.855,
    city: "West Bengal",
    state: "West Bengal",
    country: "India",
  },
  karnataka: {
    lat: 15.3173,
    lng: 75.7139,
    city: "Karnataka",
    state: "Karnataka",
    country: "India",
  },
  india: {
    lat: 22.3511,
    lng: 78.6677,
    city: "India",
    state: "",
    country: "India",
  },
  "san francisco": {
    lat: 37.7749,
    lng: -122.4194,
    city: "San Francisco",
    state: "California",
    country: "United States",
  },
  london: {
    lat: 51.5074,
    lng: -0.1278,
    city: "London",
    state: "England",
    country: "United Kingdom",
  },
  newyork: {
    lat: 40.7128,
    lng: -74.006,
    city: "New York",
    state: "New York",
    country: "United States",
  },
  "new york": {
    lat: 40.7128,
    lng: -74.006,
    city: "New York",
    state: "New York",
    country: "United States",
  },
  singapore: {
    lat: 1.3521,
    lng: 103.8198,
    city: "Singapore",
    state: "",
    country: "Singapore",
  },
  dubai: {
    lat: 25.2048,
    lng: 55.2708,
    city: "Dubai",
    state: "",
    country: "United Arab Emirates",
  },
};

export const PUBLIC_GEO_PAGES = [
  {
    slug: "kolkata",
    title: "Founders in Kolkata",
    city: "Kolkata",
    state: "West Bengal",
    country: "India",
  },
  {
    slug: "west-bengal",
    title: "Founders in West Bengal",
    city: "",
    state: "West Bengal",
    country: "India",
  },
  {
    slug: "india",
    title: "Co-founders in India",
    city: "",
    state: "",
    country: "India",
  },
  {
    slug: "bangalore",
    title: "Founders in Bangalore",
    city: "Bangalore",
    state: "Karnataka",
    country: "India",
  },
  {
    slug: "delhi",
    title: "Founders in Delhi NCR",
    city: "Delhi NCR",
    state: "Delhi",
    country: "India",
  },
  {
    slug: "mumbai",
    title: "Founders in Mumbai",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  },
];

export const DISTANCE_FILTERS = [10, 25, 50, 100];

export function coordinatesFromAddress(addressStr, coordinates) {
  const latitude = Number(coordinates?.latitude);
  const longitude = Number(coordinates?.longitude);
  const hasValidCoordinates =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  if (!addressStr || typeof addressStr !== "string") {
    if (hasValidCoordinates) {
      return { lat: latitude, lng: longitude };
    }
    return {
      lat: 12.9716,
      lng: 77.5946,
      city: "Bangalore",
      state: "Karnataka",
      country: "India",
    };
  }
  const clean = addressStr.toLowerCase();
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (clean.includes(key)) {
      return hasValidCoordinates
        ? { ...coords, lat: latitude, lng: longitude }
        : { ...coords };
    }
  }
  if (hasValidCoordinates) {
    const [city, state, country] = addressStr
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return {
      lat: latitude,
      lng: longitude,
      city,
      state,
      country: country || "India",
    };
  }
  return {
    lat: 12.9716,
    lng: 77.5946,
    city: "Bangalore",
    state: "Karnataka",
    country: "India",
  };
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  if (
    ![lat1, lon1, lat2, lon2].every((value) => Number.isFinite(Number(value)))
  )
    return null;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function publicLocation(location, address) {
  return {
    city: location?.city || "",
    state: location?.state || "",
    country: location?.country || "India",
    label:
      [location?.city, location?.state || address?.split(",")[0]].filter(
        Boolean,
      )[0] || "India",
  };
}

export function boundingBoxFilter(lat, lng, radiusKm) {
  const degLat = radiusKm / 111;
  const degLng =
    radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return {
    "location.lat": { $gte: lat - degLat, $lte: lat + degLat },
    "location.lng": { $gte: lng - degLng, $lte: lng + degLng },
  };
}
