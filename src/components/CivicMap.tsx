import { useEffect, useRef } from "react";
import L from "leaflet";
import { CivicIssue } from "../types";
import { getCategoryColor, getCategoryLabel } from "../utils";

interface CivicMapProps {
  issues: CivicIssue[];
  selectedIssue: CivicIssue | null;
  onIssueSelect: (issue: CivicIssue) => void;
  onMapClick?: (lat: number, lng: number) => void;
  reportLocation: { lat: number; lng: number } | null;
  center: { lat: number; lng: number };
}

export default function CivicMap({
  issues,
  selectedIssue,
  onIssueSelect,
  onMapClick,
  reportLocation,
  center,
}: CivicMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.FeatureGroup | null>(null);
  const reportMarkerRef = useRef<L.Marker | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Create map instance
    const map = L.map(mapContainerRef.current, {
      center: [center.lat, center.lng],
      zoom: 13,
      zoomControl: true,
    });
    mapRef.current = map;

    // Add OpenStreetMap tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Initialize markers feature group
    const markersGroup = L.featureGroup().addTo(map);
    markersGroupRef.current = markersGroup;

    return () => {
      map.off();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Listen for map clicks dynamically when the callback is provided
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    };

    map.on("click", handleMapClick);

    return () => {
      map.off("click", handleMapClick);
    };
  }, [onMapClick]);

  // Update map center when external center changes
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView([center.lat, center.lng]);
    }
  }, [center.lat, center.lng]);

  // Update report marker when user selects a report location
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (reportMarkerRef.current) {
      map.removeLayer(reportMarkerRef.current);
      reportMarkerRef.current = null;
    }

    if (reportLocation) {
      const reportIcon = L.divIcon({
        className: "custom-report-pin",
        html: `
          <div class="relative flex items-center justify-center">
            <span class="absolute inline-flex h-10 w-10 animate-ping rounded-full bg-rose-400 opacity-75"></span>
            <div class="relative h-6 w-6 rounded-full bg-rose-600 border-2 border-white shadow-md flex items-center justify-center text-white font-bold text-xs">
              +
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const marker = L.marker([reportLocation.lat, reportLocation.lng], { icon: reportIcon }).addTo(map);
      reportMarkerRef.current = marker;
      map.panTo([reportLocation.lat, reportLocation.lng]);
    }
  }, [reportLocation]);

  // Render issue pins on the map
  useEffect(() => {
    const map = mapRef.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    // Clear existing markers
    markersGroup.clearLayers();

    issues.forEach((issue) => {
      // Fetch all non-hidden issues from Firestore and place a pin at each lat/lng.
      if (issue.hidden) return;

      const isSelected = selectedIssue?.id === issue.id;
      const statusLower = (issue.status || "reported").toLowerCase();

      // Color by status: red=reported, yellow=verified, blue=in_progress, green=resolved.
      let pinColor = "#ef4444"; // red=reported
      if (statusLower === "verified" || statusLower === "reviewed") {
        pinColor = "#eab308"; // yellow=verified
      } else if (statusLower === "in_progress" || statusLower === "in progress") {
        pinColor = "#3b82f6"; // blue=in_progress
      } else if (statusLower === "resolved") {
        pinColor = "#10b981"; // green=resolved
      }

      // Increase pin size/glow with upvote count so high-upvote issues stand out as hot zones.
      const upvotes = issue.upvotes || 0;
      const upvoteFactor = Math.min(upvotes, 40); // Cap factor for size scaling
      const baseSize = 28;
      const size = baseSize + upvoteFactor * 1.2; // Stands out up to ~76px
      const glowSize = Math.min(upvoteFactor * 1.5 + (isSelected ? 10 : 0), 30);
      const glowColor = pinColor;

      const borderClass = isSelected ? "border-slate-950 scale-110 z-[1000] ring-4 ring-indigo-500/30" : "border-white";
      const shadowClass = isSelected ? "shadow-xl" : "shadow-md";

      const pinIcon = L.divIcon({
        className: "custom-issue-pin",
        html: `
          <div class="flex items-center justify-center transition-all duration-300 relative" style="width: ${size}px; height: ${size}px;">
            ${upvotes >= 10 ? `
              <span class="absolute inline-flex h-full w-full rounded-full animate-ping opacity-20" style="background-color: ${pinColor};"></span>
            ` : ""}
            <div style="background-color: ${pinColor}; width: ${size - 4}px; height: ${size - 4}px; box-shadow: 0 0 ${glowSize}px ${glowSize > 0 ? glowSize / 3 : 0}px ${glowColor};" class="relative rounded-full border-2 ${borderClass} ${shadowClass} flex items-center justify-center text-white transition-all duration-300">
              <span style="font-size: ${Math.max(10, size * 0.35)}px;" class="font-bold flex items-center justify-center select-none">
                ${issue.category === "pothole" ? "🕳️" : issue.category === "streetlight" ? "💡" : issue.category === "garbage" ? "🗑️" : issue.category === "water_leak" ? "💧" : "⚠️"}
              </span>
              ${isSelected ? `
                <span class="absolute -top-1 -right-1 flex h-3 w-3">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
                </span>
              ` : ""}
            </div>
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([issue.lat, issue.lng], { icon: pinIcon });
      
      // Bind click event
      marker.on("click", () => {
        onIssueSelect(issue);
      });

      markersGroup.addLayer(marker);
    });
  }, [issues, selectedIssue]);

  // Pan to selected issue
  useEffect(() => {
    if (selectedIssue && mapRef.current) {
      mapRef.current.setView([selectedIssue.lat, selectedIssue.lng], 15);
    }
  }, [selectedIssue]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden shadow-inner border border-slate-200">
      <div ref={mapContainerRef} className="w-full h-full" id="civic-issue-map" />
      {onMapClick && (
        <div className="absolute top-3 right-3 z-[1000] bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 font-medium shadow-sm pointer-events-none">
          {reportLocation ? "📍 Location selected" : "💡 Click map to set pin location"}
        </div>
      )}
    </div>
  );
}
