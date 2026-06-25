import { collection, getDocs, addDoc } from "firebase/firestore";
import { db } from "./firebase";

// Helper to generate a colorful SVG Data URL representing each civic issue
export function createSvgDataUrl(title: string, color: string, bg: string, emoji: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
      <rect width="100%" height="100%" fill="${encodeURIComponent(bg)}"/>
      <circle cx="300" cy="180" r="80" fill="${encodeURIComponent(color)}" opacity="0.8"/>
      <text x="300" y="200" font-size="70" text-anchor="middle" font-family="sans-serif">${emoji}</text>
      <rect x="0" y="320" width="600" height="80" fill="black" opacity="0.6"/>
      <text x="300" y="365" font-size="20" text-anchor="middle" fill="white" font-weight="bold" font-family="sans-serif">${title}</text>
    </svg>
  `.trim().replace(/\s+/g, " ");
  return `data:image/svg+xml;utf8,${svg}`;
}

export const MOCK_REPORTS = [
  {
    reporterHandle: "CityGuardian",
    photoUrl: createSvgDataUrl("Damaged Asphalt (Pothole)", "#f59e0b", "#4b5563", "🕳️"),
    description: "There is a massive pothole in the middle lane of Market Street, right in front of the transit entrance. It is extremely deep and causing cars to swerve dangerously.",
    category: "pothole",
    clean_description: "A large and hazardous pothole is located in the middle lane of Market Street, posing a threat to vehicles.",
    severity: "high",
    is_authentic: true,
    is_spam: false,
    hidden: false,
    area: "Market Street",
    lat: 37.7785,
    lng: -122.4121,
    status: "reported",
    upvotes: 24,
    upvotedBy: ["mock_u1", "mock_u2"],
    comments: [
      {
        id: "c1",
        userId: "mock_user_john",
        userNickname: "John D.",
        text: "I hit this yesterday! Extremely dangerous, glad someone reported it.",
        createdAt: Date.now() - 3600000 * 2,
      },
      {
        id: "c2",
        userId: "mock_user_sara",
        userNickname: "Sara M.",
        text: "City trucks are working nearby, hopefully they patch this up soon.",
        createdAt: Date.now() - 3600000 * 1,
      },
    ],
  },
  {
    reporterHandle: "EcoWarrior",
    photoUrl: createSvgDataUrl("Streetlight Out on Intersection", "#eab308", "#1e1b4b", "💡"),
    description: "The main overhead light at the corner of Valencia and 18th has been completely dead for a week. The intersection is pitch black at night, making it very unsafe for pedestrians.",
    category: "streetlight",
    clean_description: "An inoperative streetlight at the intersection of Valencia and 18th St results in low visibility and potential pedestrian hazards.",
    severity: "medium",
    is_authentic: true,
    is_spam: false,
    hidden: false,
    area: "Mission District",
    lat: 37.7617,
    lng: -122.4218,
    status: "verified",
    upvotes: 12,
    upvotedBy: ["mock_u3"],
    comments: [],
  },
  {
    reporterHandle: "DoloresFan",
    photoUrl: createSvgDataUrl("Illegal Dumped Garbage Pile", "#10b981", "#334155", "🗑️"),
    description: "Someone dumped several old mattresses and bags of household garbage on the sidewalk near Dolores Park. It's starting to smell and blocking the walkway.",
    category: "garbage",
    clean_description: "Multiple mattresses and household waste have been illegally dumped on the sidewalk near Dolores Park.",
    severity: "medium",
    is_authentic: true,
    is_spam: false,
    hidden: false,
    area: "Dolores Heights",
    lat: 37.7596,
    lng: -122.4269,
    status: "in_progress",
    upvotes: 18,
    upvotedBy: ["mock_u4", "mock_u5"],
    comments: [
      {
        id: "c3",
        userId: "mock_user_dp_fan",
        userNickname: "ParkLover",
        text: "This is a recurring spot for dumping. We need a security camera here.",
        createdAt: Date.now() - 3600000 * 4,
      },
    ],
  },
  {
    reporterHandle: "WaterSaviour",
    photoUrl: createSvgDataUrl("Burst Pipe Water Gush", "#3b82f6", "#1e293b", "💧"),
    description: "There is a severe water leak from a broken utility pipe on 16th Street. Clean water is gushing down the street like a creek, wasting thousands of gallons.",
    category: "water_leak",
    clean_description: "A broken municipal pipe on 16th Street is causing significant clean water loss and localized gutter flooding.",
    severity: "high",
    is_authentic: true,
    is_spam: false,
    hidden: false,
    area: "Mission District",
    lat: 37.7651,
    lng: -122.4195,
    status: "resolved",
    upvotes: 35,
    upvotedBy: ["mock_u6", "mock_u7", "mock_u8"],
    comments: [
      {
        id: "c4",
        userId: "mock_user_city_crew",
        userNickname: "PublicWorksCrew3",
        text: "Main valve has been shut off and pipe repaired. Cleanup completed.",
        createdAt: Date.now() - 3600000 * 5,
      },
    ],
  },
];

export async function seedIssuesIfEmpty() {
  try {
    const issuesCol = collection(db, "issues");
    const snapshot = await getDocs(issuesCol);
    
    if (snapshot.empty) {
      console.log("Firestore issues collection is empty. Seeding beautiful initial issues...");
      for (const item of MOCK_REPORTS) {
        await addDoc(issuesCol, {
          ...item,
          createdAt: Date.now() - Math.floor(Math.random() * 86400000 * 5), // dynamic recent timestamp
        });
      }
      console.log("Seeding completed successfully!");
    } else {
      console.log("Issues collection already contains data. Skipping seeding.");
    }
  } catch (error) {
    console.error("Error seeding issues:", error);
  }
}

