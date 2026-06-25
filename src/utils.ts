export function compressAndToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Maximum dimensions to keep file size small but clear
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get 2D context"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // Start compression at quality 0.8
        let quality = 0.8;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);

        // Keep compressing if the base64 string is above 500KB (approx 650,000 characters)
        // 500KB in base64 is about 666,666 characters
        while (dataUrl.length > 500 * 1024 && quality > 0.3) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }

        resolve(dataUrl);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getCategoryLabel(cat: string): string {
  switch (cat) {
    case "pothole":
      return "Pothole";
    case "streetlight":
      return "Streetlight Out";
    case "garbage":
      return "Garbage / Litter";
    case "water_leak":
      return "Water Leak";
    default:
      return "Other Issue";
  }
}

export function getCategoryColor(cat: string): { bg: string; text: string; border: string; markerColor: string } {
  switch (cat) {
    case "pothole":
      return { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200", markerColor: "#d97706" };
    case "streetlight":
      return { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-200", markerColor: "#eab308" };
    case "garbage":
      return { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200", markerColor: "#059669" };
    case "water_leak":
      return { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200", markerColor: "#2563eb" };
    default:
      return { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-200", markerColor: "#475569" };
  }
}

export function getSeverityColor(sev: string): string {
  switch (sev) {
    case "high":
      return "bg-rose-100 text-rose-800 border-rose-200";
    case "medium":
      return "bg-amber-100 text-amber-800 border-amber-200";
    default:
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
  }
}

export function getStatusColor(status: string): string {
  const norm = status ? status.toLowerCase() : "";
  switch (norm) {
    case "resolved":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "in_progress":
    case "in progress":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "verified":
    case "reviewed":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
}

