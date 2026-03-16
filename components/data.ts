export interface Deal {
  id: number;
  restaurant: string;
  cuisine: string;
  distance: string;
  originalPrice: number;
  dealPrice: number;
  remaining: number;
  expiresIn: string;
  status: "active" | "sold-out";
}

export const mockDeals: Deal[] = [
  {
    id: 1,
    restaurant: "Sakura Ramen House",
    cuisine: "Japanese",
    distance: "0.3mi",
    originalPrice: 50,
    dealPrice: 25,
    remaining: 5,
    expiresIn: "2h 14m",
    status: "active",
  },
  {
    id: 2,
    restaurant: "Tandoori Nights",
    cuisine: "Indian",
    distance: "1.2mi",
    originalPrice: 40,
    dealPrice: 20,
    remaining: 8,
    expiresIn: "5h 30m",
    status: "active",
  },
  {
    id: 3,
    restaurant: "Bella Napoli",
    cuisine: "Italian",
    distance: "0.8mi",
    originalPrice: 60,
    dealPrice: 30,
    remaining: 0,
    expiresIn: "0h 0m",
    status: "sold-out",
  },
];
