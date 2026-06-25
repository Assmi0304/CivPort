import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MapPin,
  AlertTriangle,
  Trash2,
  Lightbulb,
  Droplet,
  Plus,
  Search,
  Image as ImageIcon,
  ThumbsUp,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Sparkles,
  Info,
  Navigation,
  User,
  Loader2,
  ChevronRight,
  Filter,
  ExternalLink,
  Map,
  ShieldAlert,
  Flame,
  ShieldCheck,
  Hammer,
  Lock,
  Sliders,
  Settings,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  setDoc,
  query,
  orderBy,
  arrayUnion,
  increment,
} from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

import { auth, db, signInAnonymously } from "./firebase";
import { CivicIssue, IssueCategory, IssueSeverity, IssueStatus, Comment } from "./types";
import { compressAndToBase64, formatDate, getCategoryColor, getCategoryLabel, getSeverityColor, getStatusColor } from "./utils";
import { seedIssuesIfEmpty, MOCK_REPORTS } from "./seed";
import CivicMap from "./components/CivicMap";

export default function App() {
  // Auth state
  const [userId, setUserId] = useState<string>("");
  const [userNickname, setUserNickname] = useState<string>(() => {
    return localStorage.getItem("civport_nickname") || "Citizen " + Math.floor(Math.random() * 9000 + 1000);
  });
  const [userProfile, setUserProfile] = useState<{
    handle: string;
    points: number;
    badges: string[];
    homeArea: string;
  } | null>(null);

  // GPS/Area simulation state
  const [userGpsArea, setUserGpsArea] = useState<string>("Bandra");


  // Issues database state
  const [issues, setIssues] = useState<CivicIssue[]>(() => {
    const cached = localStorage.getItem("civport_issues_cache");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.error("Failed to parse cached issues:", e);
      }
    }
    // Map initial mock reports with temporary IDs for immediate display
    return MOCK_REPORTS.map((item, idx) => ({
      id: `mock_issue_${idx + 1}`,
      ...item,
      createdAt: Date.now() - 3600000 * (4 - idx) * 3, // staggered times
    })) as CivicIssue[];
  });
  const [loading, setLoading] = useState<boolean>(true);

  // Sync issues cache with localStorage
  useEffect(() => {
    if (issues.length > 0) {
      localStorage.setItem("civport_issues_cache", JSON.stringify(issues));
    }
  }, [issues]);

  // App view state
  const [selectedIssue, setSelectedIssue] = useState<CivicIssue | null>(null);
  const [viewMode, setViewMode] = useState<"view" | "report">("view");
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname);
  const [showSimulator, setShowSimulator] = useState<boolean>(false);

  // Admin authentication states
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Sync state with back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, "", path);
    setCurrentPath(path);
  };

  // Map center state (Defaults to San Francisco Center)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 37.7749, lng: -122.4194 });

  // Filters state
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("all"); // "all" means no query, else actual text
  const [showSpam, setShowSpam] = useState<boolean>(false);

  // Real search text
  const [searchText, setSearchText] = useState<string>("");

  // Report Form state
  const [formDescription, setFormDescription] = useState<string>("");
  const [formPhoto, setFormPhoto] = useState<string>(""); // base64
  const [formPhotoSize, setFormPhotoSize] = useState<number>(0); // in KB
  const [reportLocation, setReportLocation] = useState<{ lat: number; lng: number } | null>(null);

  // UI state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStage, setAnalysisStage] = useState<string>("");
  const [formError, setFormError] = useState<string>("");
  const [commentText, setCommentText] = useState<string>("");
  const [isSubmittingComment, setIsSubmittingComment] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Helper to show visual toast feedback
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
  };

  // Toast automatic dismissal timer
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Get current location ref for centering
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);

  // Helper to change issue selection and sync the URL query parameters
  const handleSelectIssue = (issue: CivicIssue | null) => {
    setSelectedIssue(issue);
    if (issue) {
      const url = new URL(window.location.href);
      url.searchParams.set("issueId", issue.id);
      window.history.pushState({}, "", url.toString());
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete("issueId");
      window.history.pushState({}, "", url.toString());
    }
  };

  // Handle auto-selection of issue based on URL search query "?issueId=XXXX" or "?id=XXXX"
  useEffect(() => {
    if (issues.length > 0) {
      const searchParams = new URLSearchParams(window.location.search);
      const urlIssueId = searchParams.get("issueId") || searchParams.get("id");
      if (urlIssueId) {
        const found = issues.find((issue) => issue.id === urlIssueId);
        if (found) {
          setSelectedIssue(found);
          setViewMode("view");
          setMapCenter({ lat: found.lat, lng: found.lng });
        }
      }
    }
  }, [issues]);

  // Smooth scroll to details container when selectedIssue is chosen on smaller devices
  useEffect(() => {
    if (selectedIssue && window.innerWidth < 1024) {
      setTimeout(() => {
        detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  }, [selectedIssue]);

  // Save nickname & sync profile with Firestore
  useEffect(() => {
    localStorage.setItem("civport_nickname", userNickname);
    if (userId) {
      const userRef = doc(db, "users", userId);
      // Determine badges dynamically based on user profile points
      // Unlock badge 'Neighbourhood Watch' at 50 points, 'Community Hero' at 100 points.
      const currentPoints = userProfile?.points || 0;
      const calculatedBadges: string[] = ["Pioneer"];
      if (currentPoints >= 50) {
        calculatedBadges.push("Neighbourhood Watch");
      }
      if (currentPoints >= 100) {
        calculatedBadges.push("Community Hero");
      }

      setDoc(userRef, {
        handle: userNickname,
        badges: calculatedBadges
      }, { merge: true }).catch((err) => {
        console.error("Failed to update user profile in Firestore:", err);
      });
    }
  }, [userNickname, userId, userProfile?.points]);

  useEffect(() => {
    let unsubscribeIssues: () => void = () => {};
    let unsubscribeUser: () => void = () => {};

    // Standard Anonymous Sign In on Mount
    signInAnonymously(auth)
      .then((credential) => {
        const uid = credential.user.uid;
        setUserId(uid);

        // Fetch user profile from users collection in real-time
        const userRef = doc(db, "users", uid);
        unsubscribeUser = onSnapshot(userRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setUserProfile({
              handle: data.handle || userNickname,
              points: data.points !== undefined ? data.points : 0,
              badges: data.badges || [],
              homeArea: data.homeArea || "",
            });
            if (data.handle) {
              setUserNickname(data.handle);
            }
          } else {
            const defaultProfile = {
              handle: userNickname,
              points: 0,
              badges: ["Pioneer"],
              homeArea: "Bandra",
            };
            setDoc(userRef, defaultProfile).catch((err) => console.error("Error setting user profile:", err));
            setUserProfile(defaultProfile);
          }
        });

        // Fetch issues list in real-time from Firestore (was "reports")
        const q = query(collection(db, "issues"), orderBy("createdAt", "desc"));
        unsubscribeIssues = onSnapshot(
          q,
          async (snapshot) => {
            const fetched: CivicIssue[] = [];
            snapshot.forEach((docSnap) => {
              fetched.push({ id: docSnap.id, ...docSnap.data() } as CivicIssue);
            });
            
            // Only update local state if we actually fetched documents, or if snapshot was empty we seed
            if (!snapshot.empty) {
              setIssues(fetched);
            } else {
              // Seed if Firestore is completely empty
              await seedIssuesIfEmpty();
            }
            setLoading(false);
          },
          (error) => {
            console.error("Firestore loading failed, falling back to local cached issues:", error);
            // On permission or network failure, we stop loading and keep using cached/mock issues
            setLoading(false);
          }
        );
      })
      .catch((err) => {
        console.error("Anonymous sign in failed:", err);
        setLoading(false);
      });

    // Request browser location on mount to center map and reverse-geocode GPS area
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setMapCenter({ lat, lng });

          // Reverse geocode to detect current user area
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
            headers: {
              "Accept-Language": "en",
              "User-Agent": "CivPort-Applet"
            }
          })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data) {
              const address = data.address || {};
              const resolvedArea = address.suburb || address.neighbourhood || address.village || address.city_district || address.city || "Bandra";
              setUserGpsArea(resolvedArea);
              console.log("On-mount user GPS area resolved to:", resolvedArea);
            }
          })
          .catch((err) => console.error("Error reverse-geocoding user GPS location:", err));
        },
        (error) => {
          console.log("Geolocation permission denied, using default coordinates.");
        }
      );
    }

    return () => {
      unsubscribeIssues();
      unsubscribeUser();
    };
  }, []);

  // Use current location button handler
  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setReportLocation(coords);
          setMapCenter(coords);
        },
        (error) => {
          alert("Unable to retrieve your location. Please select it manually by clicking the map.");
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  };

  // Helper to safely reset form fields and enter report mode
  const handleEnterReportMode = () => {
    setFormDescription("");
    setFormPhoto("");
    setFormPhotoSize(0);
    setFormError("");
    setReportLocation({ ...mapCenter });
    setViewMode("report");
    handleSelectIssue(null);
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFileProcessing(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleFileProcessing(e.target.files[0]);
    }
  };

  const handleFileProcessing = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setFormError("Only image files are allowed.");
      return;
    }
    setFormError("");
    try {
      const base64Str = await compressAndToBase64(file);
      setFormPhoto(base64Str);
      // Base64 string length is roughly 1.33 * file size in bytes
      const approxKb = Math.round((base64Str.length * 0.75) / 1024);
      setFormPhotoSize(approxKb);
    } catch (err) {
      console.error("Image processing error:", err);
      setFormError("Failed to compress or read image.");
    }
  };

  // Submit Issue and trigger Gemini API Analysis
  const handleSubmitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formDescription.trim()) {
      setFormError("Please write a short description to assist municipal services.");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisStage("Acquiring precise GPS coordinates...");

    // 1. Get GPS coordinates
    let lat = 37.7749;
    let lng = -122.4194;
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation not supported."));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 0,
        });
      });
      lat = position.coords.latitude;
      lng = position.coords.longitude;
    } catch (gpsErr) {
      console.warn("GPS failed, using manual pin or map center coordinates:", gpsErr);
      if (reportLocation) {
        lat = reportLocation.lat;
        lng = reportLocation.lng;
      } else {
        lat = mapCenter.lat;
        lng = mapCenter.lng;
      }
    }

    // 2. Query Nominatim reverse geocoding
    setAnalysisStage("Resolving municipal area from OpenStreetMap...");
    let areaName = "Bandra";
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "CivPort-Applet"
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        const address = data.address || {};
        areaName = address.suburb || address.neighbourhood || address.village || address.city_district || address.city || "Bandra";
      }
    } catch (geoErr) {
      console.error("Nominatim geocoding failed:", geoErr);
    }

    // 3. Upload photo to Firebase Storage
    let uploadedPhotoUrl = "";
    if (formPhoto) {
      setAnalysisStage("Uploading photographic evidence to Firebase Storage...");
      try {
        const filename = `issues/${userId || "anon"}-${Date.now()}.jpg`;
        const storageRef = ref(storage, filename);
        await uploadString(storageRef, formPhoto, "data_url");
        uploadedPhotoUrl = await getDownloadURL(storageRef);
      } catch (storageErr) {
        console.error("Firebase Storage upload failed:", storageErr);
        uploadedPhotoUrl = formPhoto; // fallback to local base64
      }
    }

    // 4. Sends photo + description to Gemini
    setAnalysisStage("Analyzing report via Gemini AI verification...");
    let aiAnalysis = {
      category: "other",
      clean_description: formDescription,
      severity: "medium",
      is_authentic: true,
      is_spam: false,
    };

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: formPhoto || "", // use base64 for Vision analysis on backend
          description: formDescription,
        }),
      });

      if (!response.ok) {
        throw new Error("AI engine failed to analyze the report.");
      }

      const result = await response.json();
      if (result.success && result.analysis) {
        aiAnalysis = result.analysis;
      }
    } catch (aiErr) {
      console.error("Gemini analysis error:", aiErr);
    }

    // 5. Hide if spam or unauthentic
    const isSpam = aiAnalysis.is_spam === true;
    const isAuthentic = aiAnalysis.is_authentic !== false;
    const isHidden = isSpam || !isAuthentic;

    setAnalysisStage("Registering report with Firestore...");

    const reporterHandle = userNickname || "Citizen";

    const newIssueData = {
      reporterHandle,
      photoUrl: uploadedPhotoUrl,
      description: formDescription,
      clean_description: aiAnalysis.clean_description || formDescription,
      category: aiAnalysis.category || "other",
      severity: aiAnalysis.severity || "medium",
      is_authentic: isAuthentic,
      is_spam: isSpam,
      hidden: isHidden,
      area: areaName,
      lat,
      lng,
      upvotes: 0,
      upvotedBy: [] as string[],
      comments: [] as Comment[],
      status: "reported", // reported | verified | in_progress | resolved
      createdAt: Date.now(),
    };

    try {
      const docRef = await addDoc(collection(db, "issues"), newIssueData);
      
      // If authentic and not spam, reward municipal citizen points
      if (!isSpam && userId) {
        try {
          const userRef = doc(db, "users", userId);
          await updateDoc(userRef, {
            points: increment(5),
            homeArea: areaName,
          });
        } catch (ptsErr) {
          console.error("Failed to update user rewards:", ptsErr);
        }
      }

      const newlyCreatedIssue: CivicIssue = {
        id: docRef.id,
        ...newIssueData,
      };

      // Reset Form State
      setFormDescription("");
      setFormPhoto("");
      setFormPhotoSize(0);
      setReportLocation(null);
      setViewMode("view");

      if (isHidden) {
        showToast("AI flagged report as spam or untrustworthy. Saved as hidden.", "error");
      } else {
        handleSelectIssue(newlyCreatedIssue);
        setMapCenter({ lat: newlyCreatedIssue.lat, lng: newlyCreatedIssue.lng });
        showToast("Civic report submitted and verified successfully!");
      }
    } catch (err: any) {
      console.error("Firestore submit error, falling back to local storage:", err);
      
      const localId = "local_issue_" + Math.random().toString(36).substring(2, 9);
      const newlyCreatedIssue: CivicIssue = {
        id: localId,
        ...newIssueData,
      };

      // Add to local state list
      setIssues(prev => [newlyCreatedIssue, ...prev]);

      // Reset Form State
      setFormDescription("");
      setFormPhoto("");
      setFormPhotoSize(0);
      setReportLocation(null);
      setViewMode("view");

      if (isHidden) {
        showToast("AI flagged report as spam. Saved locally.", "error");
      } else {
        handleSelectIssue(newlyCreatedIssue);
        setMapCenter({ lat: newlyCreatedIssue.lat, lng: newlyCreatedIssue.lng });
        showToast("Civic report submitted successfully! (Saved locally)");
      }
    } finally {
      setIsAnalyzing(false);
      setAnalysisStage("");
    }
  };

  // Upvote Issue
  const handleUpvote = async (issueId: string) => {
    if (!userId) return;

    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;

    const upvotedByList = issue.upvotedBy || [];
    if (upvotedByList.includes(userId)) {
      showToast("You have already upvoted this report.", "error");
      return;
    }

    // Compare user's GPS-detected area to the issue's area field
    const isLocalResident = (userGpsArea && issue.area)
      ? userGpsArea.trim().toLowerCase() === issue.area.trim().toLowerCase()
      : false;

    if (!isLocalResident) {
      showToast("Only local residents can verify this issue.", "error");
      return;
    }

    try {
      const docRef = doc(db, "issues", issueId);
      await updateDoc(docRef, {
        upvotes: increment(1),
        upvotedBy: arrayUnion(userId),
      });

      // Add +2 points when their upvote is accepted.
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        points: increment(2),
      });

      // Update local issues list
      setIssues(prev => prev.map(issue => {
        if (issue.id === issueId) {
          const upvotedByList = issue.upvotedBy || [];
          return {
            ...issue,
            upvotes: (issue.upvotes || 0) + 1,
            upvotedBy: [...upvotedByList, userId]
          };
        }
        return issue;
      }));

      if (selectedIssue && selectedIssue.id === issueId) {
        setSelectedIssue((prev) => {
          if (!prev) return null;
          const prevUpvotedBy = prev.upvotedBy || [];
          return {
            ...prev,
            upvotes: (prev.upvotes || 0) + 1,
            upvotedBy: [...prevUpvotedBy, userId],
          };
        });
      }
      showToast("Report upvoted successfully! Earned +2 points.");
    } catch (err: any) {
      console.error("Upvoting failed, performing local upvote:", err);
      
      // Local fallback
      setIssues(prev => prev.map(issue => {
        if (issue.id === issueId) {
          const upvotedByList = issue.upvotedBy || [];
          return {
            ...issue,
            upvotes: (issue.upvotes || 0) + 1,
            upvotedBy: [...upvotedByList, userId]
          };
        }
        return issue;
      }));

      if (selectedIssue && selectedIssue.id === issueId) {
        setSelectedIssue((prev) => {
          if (!prev) return null;
          const prevUpvotedBy = prev.upvotedBy || [];
          return {
            ...prev,
            upvotes: (prev.upvotes || 0) + 1,
            upvotedBy: [...prevUpvotedBy, userId],
          };
        });
      }
      showToast("Report upvoted successfully! (Offline mode)");
    }
  };

  // Submit Community Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssue || !commentText.trim() || !userId) return;

    setIsSubmittingComment(true);
    const newComment: Comment = {
      id: Math.random().toString(36).substring(2, 9),
      userId,
      userNickname: userNickname.trim() || "Anonymous Citizen",
      text: commentText.trim(),
      createdAt: Date.now(),
    };

    try {
      const docRef = doc(db, "issues", selectedIssue.id);
      await updateDoc(docRef, {
        comments: arrayUnion(newComment),
      });

      // Update local issues list
      setIssues(prev => prev.map(issue => {
        if (issue.id === selectedIssue.id) {
          const prevComments = issue.comments || [];
          return {
            ...issue,
            comments: [...prevComments, newComment]
          };
        }
        return issue;
      }));

      setSelectedIssue((prev) => {
        if (!prev) return null;
        const prevComments = prev.comments || [];
        return {
          ...prev,
          comments: [...prevComments, newComment],
        };
      });

      setCommentText("");
      showToast("Comment posted successfully!");
    } catch (err: any) {
      console.error("Adding comment failed, performing local comment:", err);
      
      // Local fallback
      setIssues(prev => prev.map(issue => {
        if (issue.id === selectedIssue.id) {
          const prevComments = issue.comments || [];
          return {
            ...issue,
            comments: [...prevComments, newComment]
          };
        }
        return issue;
      }));

      setSelectedIssue((prev) => {
        if (!prev) return null;
        const prevComments = prev.comments || [];
        return {
          ...prev,
          comments: [...prevComments, newComment],
        };
      });

      setCommentText("");
      showToast("Comment posted successfully! (Offline mode)");
    } finally {
      setIsSubmittingComment(false);
    }
  };


  // Advance Report Status (For mock administrative interactive simulation)
  const handleAdvanceStatus = async (issueId: string, currentStatus: string) => {
    let nextStatus = "reported";
    const statusLower = currentStatus ? currentStatus.toLowerCase() : "reported";
    if (statusLower === "reported") nextStatus = "verified";
    else if (statusLower === "verified") nextStatus = "in_progress";
    else if (statusLower === "in_progress" || statusLower === "in progress") nextStatus = "resolved";
    else return;

    try {
      const docRef = doc(db, "issues", issueId);
      await updateDoc(docRef, {
        status: nextStatus,
      });

      // Update local issues list
      setIssues(prev => prev.map(issue => {
        if (issue.id === issueId) {
          return { ...issue, status: nextStatus };
        }
        return issue;
      }));

      // Update selected issue locally
      if (selectedIssue && selectedIssue.id === issueId) {
        setSelectedIssue((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: nextStatus,
          };
        });
      }
      showToast(`Status successfully updated to ${nextStatus.replace('_', ' ')}!`);
    } catch (err: any) {
      console.error("Status update failed, performing local update:", err);
      
      // Local fallback
      setIssues(prev => prev.map(issue => {
        if (issue.id === issueId) {
          return { ...issue, status: nextStatus };
        }
        return issue;
      }));

      if (selectedIssue && selectedIssue.id === issueId) {
        setSelectedIssue((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: nextStatus,
          };
        });
      }
      showToast(`Status successfully updated to ${nextStatus.replace('_', ' ')}! (Offline mode)`);
    }
  };

  // Direct status update (Used in Admin Dashboard)
  const handleSetStatus = async (issueId: string, nextStatus: string) => {
    try {
      const docRef = doc(db, "issues", issueId);
      await updateDoc(docRef, {
        status: nextStatus,
      });

      // Update local issues list
      setIssues(prev => prev.map(issue => {
        if (issue.id === issueId) {
          return { ...issue, status: nextStatus };
        }
        return issue;
      }));

      // Update selected issue locally
      if (selectedIssue && selectedIssue.id === issueId) {
        setSelectedIssue((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: nextStatus,
          };
        });
      }
      showToast(`Status successfully updated to ${nextStatus.replace('_', ' ')}!`);
    } catch (err: any) {
      console.error("Status update failed, performing local update:", err);
      
      // Local fallback
      setIssues(prev => prev.map(issue => {
        if (issue.id === issueId) {
          return { ...issue, status: nextStatus };
        }
        return issue;
      }));

      if (selectedIssue && selectedIssue.id === issueId) {
        setSelectedIssue((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: nextStatus,
          };
        });
      }
      showToast(`Status successfully updated to ${nextStatus.replace('_', ' ')}! (Offline mode)`);
    }
  };

  // Submit handler for Admin password check
  const handleAdminPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasswordInput === "admin123") {
      setIsAdminAuthenticated(true);
      setPasswordError(null);
      showToast("Access Granted. Welcome, Administrator!");
    } else {
      setPasswordError("Invalid administrative credentials. Please try again.");
      showToast("Access Denied", "error");
    }
  };

  // Filter and Search logic
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      // Don't show hidden unless showSpam is toggled
      if (issue.hidden && !showSpam) return false;

      // Spam / Authenticity filters
      if (!showSpam && (issue.is_spam || !issue.is_authentic)) return false;

      // Category filter
      if (categoryFilter !== "all" && issue.category !== categoryFilter) return false;

      // Severity filter
      if (severityFilter !== "all" && issue.severity !== severityFilter) return false;

      // Status filter
      if (statusFilter !== "all" && issue.status !== statusFilter) return false;

      // Text search
      if (searchText.trim() !== "") {
        const queryText = searchText.toLowerCase();
        const descMatch = (issue.description || "").toLowerCase().includes(queryText);
        const cleanDescMatch = (issue.clean_description || "").toLowerCase().includes(queryText);
        const categoryMatch = (issue.category || "").toLowerCase().includes(queryText);
        if (!descMatch && !cleanDescMatch && !categoryMatch) return false;
      }

      return true;
    });
  }, [issues, categoryFilter, severityFilter, statusFilter, searchText, showSpam]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = issues.length;
    const resolved = issues.filter((i) => {
      const s = i.status ? i.status.toLowerCase() : "";
      return s === "resolved";
    }).length;
    const inProgress = issues.filter((i) => {
      const s = i.status ? i.status.toLowerCase() : "";
      return s === "in_progress" || s === "in progress";
    }).length;
    const authenticCount = issues.filter((i) => i.is_authentic && !i.is_spam).length;
    const spamCount = issues.filter((i) => i.is_spam).length;

    const authPct = total > 0 ? Math.round((authenticCount / total) * 100) : 100;

    return { total, resolved, inProgress, authPct, spamCount };
  }, [issues]);

  // Admin dashboard groupings and calculations
  const adminGroupedIssues = useMemo(() => {
    const groups: Record<string, CivicIssue[]> = {};
    issues.forEach((issue) => {
      if (issue.hidden) return;
      const area = issue.area || "General";
      if (!groups[area]) {
        groups[area] = [];
      }
      groups[area].push(issue);
    });

    return Object.entries(groups).map(([areaName, areaIssues]) => {
      // Sort issues within this area by upvotes descending
      const sortedIssues = [...areaIssues].sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
      
      const totalUpvotes = areaIssues.reduce((sum, i) => sum + (i.upvotes || 0), 0);
      const unresolvedCount = areaIssues.filter((i) => {
        const s = i.status ? i.status.toLowerCase() : "";
        return s !== "resolved";
      }).length;
      
      // Mark an area as a 'Hot Zone' visually if it has more than 5 unresolved issues OR 20+ total upvotes.
      const isHotZone = unresolvedCount > 5 || totalUpvotes >= 20;

      return {
        areaName,
        issues: sortedIssues,
        totalUpvotes,
        unresolvedCount,
        isHotZone,
      };
    }).sort((a, b) => {
      // Hot Zones first, then by total upvotes descending, then alphabetically
      if (a.isHotZone && !b.isHotZone) return -1;
      if (!a.isHotZone && b.isHotZone) return 1;
      if (b.totalUpvotes !== a.totalUpvotes) return b.totalUpvotes - a.totalUpvotes;
      return a.areaName.localeCompare(b.areaName);
    });
  }, [issues]);

  // Hot zone briefings state & tracking ref
  const [briefings, setBriefings] = useState<Record<string, { text: string; loading: boolean; error: string | null }>>({});
  const fetchedAreasRef = useRef<Set<string>>(new Set());

  // Memoized fetch function for a single hot zone briefing
  const fetchBriefing = useCallback((areaName: string, areaIssues: CivicIssue[]) => {
    fetchedAreasRef.current.add(areaName);

    // Set state to loading
    setBriefings((prev) => ({
      ...prev,
      [areaName]: { text: "", loading: true, error: null },
    }));

    fetch("/api/hotzone-briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issues: areaIssues,
        areaName: areaName,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to generate briefing");
        return res.json();
      })
      .then((data) => {
        setBriefings((prev) => ({
          ...prev,
          [areaName]: { text: data.briefing, loading: false, error: null },
        }));
      })
      .catch((err: any) => {
        console.error(`Error fetching briefing for ${areaName}:`, err);
        // Allow automatic or manual retry by removing from fetched set
        fetchedAreasRef.current.delete(areaName);
        setBriefings((prev) => ({
          ...prev,
          [areaName]: {
            text: "",
            loading: false,
            error: err?.message || "Failed to generate briefing. Ensure Gemini API key is configured.",
          },
        }));
      });
  }, []);

  // Fetch briefings for hot zones automatically on mount/path changes
  useEffect(() => {
    if (currentPath !== "/admin") return;

    adminGroupedIssues.forEach((group) => {
      if (group.isHotZone && !fetchedAreasRef.current.has(group.areaName)) {
        fetchBriefing(group.areaName, group.issues);
      }
    });
  }, [adminGroupedIssues, currentPath, fetchBriefing]);

  // Admin Photo Modal state
  const [selectedAdminPhoto, setSelectedAdminPhoto] = useState<string | null>(null);

  const renderAdminDashboard = () => {
    // Quick calculations
    const totalAreas = adminGroupedIssues.length;
    const hotZonesCount = adminGroupedIssues.filter((a) => a.isHotZone).length;
    const unresolvedTotal = adminGroupedIssues.reduce((sum, a) => sum + a.unresolvedCount, 0);

    return (
      <div className="flex flex-col gap-6 w-full">
        {/* Admin Intro Block */}
        <div className="bg-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
          {/* Decorative background gradients */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none"></div>

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-black uppercase tracking-wider rounded-full">
                  Municipal Portal
                </span>
                {hotZonesCount > 0 && (
                  <span className="px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-black uppercase tracking-wider rounded-full flex items-center gap-1 animate-pulse">
                    <Flame className="h-3 w-3 text-rose-400" />
                    {hotZonesCount} Hot Zones Active
                  </span>
                )}
              </div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                Municipal Command Center
              </h2>
              <p className="text-sm text-slate-300 font-semibold max-w-2xl leading-relaxed">
                Administrative dashboard for reviewing citizen-reported infrastructure failures. Prioritize dispatch and resolve issues grouped by community area.
              </p>
            </div>

            {/* QUICK STATS CARDS */}
            <div className="grid grid-cols-3 gap-4 min-w-[280px] sm:min-w-[340px]">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 flex flex-col items-center justify-center text-center backdrop-blur-xs">
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-1">Total Areas</span>
                <span className="text-xl md:text-2xl font-black text-white">{totalAreas}</span>
              </div>
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3.5 flex flex-col items-center justify-center text-center backdrop-blur-xs">
                <span className="text-[10px] text-rose-400 font-black uppercase tracking-wider mb-1">Hot Zones</span>
                <span className="text-xl md:text-2xl font-black text-rose-400 flex items-center gap-1">
                  <Flame className="h-5 w-5 animate-pulse" />
                  {hotZonesCount}
                </span>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 flex flex-col items-center justify-center text-center backdrop-blur-xs">
                <span className="text-[10px] text-amber-400 font-black uppercase tracking-wider mb-1">Unresolved</span>
                <span className="text-xl md:text-2xl font-black text-amber-400">{unresolvedTotal}</span>
              </div>
            </div>
          </div>
        </div>

        {/* GROUPED LIST OF AREAS */}
        {adminGroupedIssues.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-xs flex flex-col items-center justify-center gap-4">
            <div className="h-16 w-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center text-slate-300">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800">No active reports found</h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">All issues are either hidden or there are no issues reported yet.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {adminGroupedIssues.map(({ areaName, issues: areaIssues, totalUpvotes, unresolvedCount, isHotZone }) => (
              <div
                key={areaName}
                className={`bg-white rounded-3xl border transition-all duration-300 shadow-xs hover:shadow-md flex flex-col overflow-hidden ${
                  isHotZone
                    ? "border-rose-200 shadow-rose-50/20 ring-1 ring-rose-500/10 bg-gradient-to-b from-rose-50/10 to-white"
                    : "border-slate-200/80"
                }`}
              >
                {/* AREA PANEL HEADER */}
                <div
                  className={`px-5 py-4.5 flex items-center justify-between border-b gap-4 ${
                    isHotZone
                      ? "bg-gradient-to-r from-rose-50 to-rose-50/20 border-rose-100"
                      : "bg-slate-50/50 border-slate-100"
                  }`}
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-slate-900 truncate">
                        {areaName}
                      </h3>
                      {isHotZone && (
                        <span className="px-2.5 py-0.5 bg-rose-600 text-white text-[9px] font-black uppercase tracking-wider rounded-full flex items-center gap-1 shadow-sm animate-pulse">
                          <Flame className="h-2.5 w-2.5" />
                          Hot Zone
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3.5 text-[10px] font-bold text-slate-400">
                      <span className="flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3 text-slate-400" />
                        {unresolvedCount} Unresolved
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3 text-slate-400" />
                        {totalUpvotes} Total Upvotes
                      </span>
                    </div>
                  </div>

                  {/* Hot Zone criteria visual meter */}
                  {isHotZone && (
                    <div className="text-right shrink-0">
                      <span className="text-[9px] font-black uppercase tracking-widest text-rose-500 block">Threat Score</span>
                      <span className="text-xs font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-200">
                        {Math.max(unresolvedCount * 2, Math.round(totalUpvotes / 1.5))}/10
                      </span>
                    </div>
                  )}
                </div>

                {/* AI Briefing Block if Hot Zone */}
                {isHotZone && briefings[areaName] && (
                  <div className="mx-4 mt-4 px-4 py-3.5 bg-rose-50/50 border border-rose-100 rounded-2xl flex flex-col gap-1.5 relative overflow-hidden shadow-[inset_0_1px_2px_rgba(244,63,94,0.02)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-wider text-rose-600 flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-rose-500 fill-rose-500/10 animate-pulse" />
                        AI Hot Zone Briefing
                      </span>
                      <span className="text-[8px] font-black text-rose-400/80 uppercase tracking-wider">Gemini Active</span>
                    </div>

                    {briefings[areaName].loading ? (
                      <div className="flex flex-col gap-2 py-1 animate-pulse">
                        <div className="h-3 bg-rose-200/40 rounded-md w-full"></div>
                        <div className="h-3 bg-rose-200/40 rounded-md w-11/12"></div>
                        <div className="h-3 bg-rose-200/40 rounded-md w-4/5"></div>
                      </div>
                    ) : briefings[areaName].error ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
                        <p className="text-[11px] text-rose-500/90 font-semibold italic leading-relaxed">
                          ⚠️ Briefing unavailable: {briefings[areaName].error}
                        </p>
                        <button
                          onClick={() => fetchBriefing(areaName, areaIssues)}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1 shrink-0 self-start sm:self-auto"
                        >
                          <Sparkles className="h-2.5 w-2.5" />
                          Retry AI Brief
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-rose-950 font-semibold leading-relaxed">
                        {briefings[areaName].text}
                      </p>
                    )}
                  </div>
                )}

                {/* AREA ISSUES STACK */}
                <div className="p-4 flex flex-col gap-3.5 divide-y divide-slate-100">
                  {areaIssues.map((issue, idx) => {
                    const statusLower = (issue.status || "reported").toLowerCase();
                    const formattedStatus = statusLower === "reported" ? "Reported" :
                                            statusLower === "verified" || statusLower === "reviewed" ? "Acknowledged" :
                                            statusLower === "in_progress" || statusLower === "in progress" ? "In Progress" :
                                            statusLower === "resolved" ? "Resolved" : statusLower;

                    return (
                      <div key={issue.id} className={`flex flex-col gap-3 ${idx > 0 ? "pt-3.5" : ""}`}>
                        {/* Upper Section: Meta & Details */}
                        <div className="flex gap-3 items-start justify-between">
                          <div className="flex gap-2.5 items-start min-w-0">
                            {/* Icon / Avatar preview */}
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${getCategoryColor(issue.category).bg} ${getCategoryColor(issue.category).border}`}>
                              <span className="text-sm">
                                {issue.category === "pothole" ? "🕳️" : issue.category === "streetlight" ? "💡" : issue.category === "garbage" ? "🗑️" : issue.category === "water_leak" ? "💧" : "⚠️"}
                              </span>
                            </div>

                            {/* Text / Info */}
                            <div className="min-w-0 flex flex-col">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-black text-slate-800 truncate">
                                  {getCategoryLabel(issue.category)}
                                </span>
                                <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.2 rounded font-black border ${getSeverityColor(issue.severity)}`}>
                                  {issue.severity}
                                </span>
                                <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.2 rounded font-black border ${getStatusColor(issue.status)}`}>
                                  {formattedStatus}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-600 font-medium leading-relaxed mt-1 break-words">
                                {issue.clean_description || issue.description}
                              </p>
                              {issue.clean_description && (
                                <span className="text-[8px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold rounded-lg px-2 py-0.5 mt-1.5 w-fit flex items-center gap-1">
                                  🤖 AI Refined & Verified
                                </span>
                              )}
                              <span className="text-[9px] text-slate-400 mt-1 font-semibold">
                                Reported by {issue.reporter_name || "Anonymous"} • {formatDate(issue.created_at)}
                              </span>
                            </div>
                          </div>

                          {/* Right: Score/Photo Thumbnail */}
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                              <ThumbsUp className="h-2.5 w-2.5 text-emerald-600" />
                              {issue.upvotes || 0}
                            </span>
                            {issue.photo_url && (
                              <button
                                onClick={() => setSelectedAdminPhoto(issue.photo_url || null)}
                                className="h-10 w-10 rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-500 cursor-zoom-in transition-all"
                                title="Click to view full photo"
                              >
                                <img
                                  src={issue.photo_url}
                                  alt="Thumbnail"
                                  className="h-full w-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Lower Section: Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2 bg-slate-50/50 p-2 rounded-xl border border-slate-100">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-1.5">Set Status:</span>
                          
                          {/* Acknowledged Button */}
                          <button
                            onClick={() => handleSetStatus(issue.id, "verified")}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all border cursor-pointer ${
                              statusLower === "verified" || statusLower === "reviewed"
                                ? "bg-amber-100 border-amber-300 text-amber-800 font-black"
                                : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                            }`}
                          >
                            <ShieldCheck className="h-3 w-3" />
                            <span>Acknowledged</span>
                          </button>

                          {/* In Progress Button */}
                          <button
                            onClick={() => handleSetStatus(issue.id, "in_progress")}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all border cursor-pointer ${
                              statusLower === "in_progress" || statusLower === "in progress"
                                ? "bg-blue-100 border-blue-300 text-blue-800 font-black"
                                : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                            }`}
                          >
                            <Hammer className="h-3 w-3" />
                            <span>In Progress</span>
                          </button>

                          {/* Resolved Button */}
                          <button
                            onClick={() => handleSetStatus(issue.id, "resolved")}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all border cursor-pointer ${
                              statusLower === "resolved"
                                ? "bg-emerald-100 border-emerald-300 text-emerald-800 font-black"
                                : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                            }`}
                          >
                            <CheckCircle className="h-3 w-3" />
                            <span>Resolved</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ADMIN PHOTO DETAIL OVERLAY/MODAL */}
        <AnimatePresence>
          {selectedAdminPhoto && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedAdminPhoto(null)}
              className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="relative max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl bg-slate-900 border border-white/10"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={selectedAdminPhoto}
                  alt="Full Report Detail Photo"
                  className="max-w-full max-h-[80vh] object-contain"
                  referrerPolicy="no-referrer"
                />
                <button
                  onClick={() => setSelectedAdminPhoto(null)}
                  className="absolute top-3 right-3 bg-black/60 text-white rounded-full p-2 hover:bg-black/90 transition-all border border-white/10 cursor-pointer"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const activeCategoryLabel = getCategoryLabel(categoryFilter);

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-slate-800 selection:bg-indigo-500 selection:text-white">
      {/* HEADER SECTION */}
      {/* HEADER SECTION */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/50 sticky top-0 z-30 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.02)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* BRAND AND NAVIGATION */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-3">
              {/* Premium composite logo representing map + report */}
              <div className="relative h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-100/50 border border-indigo-400/20 overflow-visible shrink-0">
                <Map className="h-5 w-5 text-indigo-100" />
                <div className="absolute -bottom-1 -right-1 h-4.5 w-4.5 rounded-md bg-emerald-500 border border-white flex items-center justify-center text-white shadow-sm animate-pulse">
                  <Sparkles className="h-2.5 w-2.5 fill-white text-white" />
                </div>
              </div>
              
              <div>
                <h1 className="text-base font-black tracking-tight text-slate-950 flex items-center gap-1.5 leading-none">
                  <span>Civ<span className="text-indigo-600">Port</span></span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-extrabold border border-indigo-100 uppercase tracking-wider">
                    AI Verifier
                  </span>
                </h1>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Smart Community Action</p>
              </div>
            </div>

            {/* NAV LINKS */}
            <nav className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-xl border border-slate-200/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
              <button
                onClick={() => navigateTo("/")}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                  currentPath !== "/admin"
                    ? "bg-white text-indigo-700 shadow-xs border border-slate-200/20"
                    : "text-slate-500 hover:text-slate-950"
                }`}
              >
                <Map className="h-3.5 w-3.5" />
                <span>Citizen View</span>
              </button>
              <button
                onClick={() => navigateTo("/admin")}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                  currentPath === "/admin"
                    ? "bg-white text-indigo-700 shadow-xs border border-slate-200/20"
                    : "text-slate-500 hover:text-slate-950"
                }`}
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>Admin Panel</span>
              </button>
            </nav>
          </div>

          {/* RIGHT UTILITIES BAR */}
          <div className="flex flex-wrap items-center gap-3 justify-end">
            {/* Quick stats (Compact & Premium) */}
            <div className="hidden lg:flex items-center gap-4 bg-slate-50/60 border border-slate-200/40 p-1.5 px-3 rounded-xl">
              <div className="flex items-center gap-1.5 border-r border-slate-200/60 pr-3">
                <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest">Reports</span>
                <span className="text-xs font-black text-slate-800">{stats.total}</span>
              </div>
              <div className="flex items-center gap-1.5 border-r border-slate-200/60 pr-3">
                <span className="text-[9px] text-emerald-600/90 font-extrabold uppercase tracking-widest">Resolved</span>
                <span className="text-xs font-black text-emerald-600">{stats.resolved}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-indigo-600/90 font-extrabold uppercase tracking-widest">Trust</span>
                <span className="text-xs font-black text-indigo-600">{stats.authPct}%</span>
              </div>
            </div>

            {/* Open in New Tab */}
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-indigo-100 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-700 font-extrabold text-[10px] uppercase tracking-wider transition-all cursor-pointer shadow-xs hover:shadow-sm"
              title="Open application in a full browser tab to enable camera/GPS permissions"
            >
              <ExternalLink className="h-3 w-3" />
              <span className="hidden sm:inline">New Tab</span>
            </a>

            {/* Dev Simulator Toggle */}
            <button
              onClick={() => setShowSimulator(!showSimulator)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                showSimulator
                  ? "bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-200/50 animate-pulse-slow"
                  : "bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-600"
              }`}
            >
              <Sliders className="h-3 w-3" />
              <span>Simulator</span>
              {userGpsArea && (
                <span className={`ml-1 px-1 py-0.5 rounded text-[8px] font-black ${showSimulator ? "bg-white text-amber-600" : "bg-amber-100 text-amber-800"}`}>
                  {userGpsArea}
                </span>
              )}
            </button>
          </div>

        </div>

        {/* COLLAPSIBLE DEV SIMULATOR CONTROL BAR */}
        <AnimatePresence>
          {showSimulator && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden border-t border-slate-200/50 bg-slate-50/90 backdrop-blur-md"
            >
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* 1. GPS Area Simulator */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/70 shadow-2xs flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-amber-600 font-black text-[10px] uppercase tracking-wider">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>GPS Area Simulator</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                    Type an area (e.g. <span className="text-slate-600 font-extrabold">Mission District</span>, <span className="text-slate-600 font-extrabold">Market Street</span>, or <span className="text-slate-600 font-extrabold">Dolores Heights</span>) to simulate physical presence.
                  </p>
                  <div className="flex gap-1.5 mt-1">
                    <input
                      type="text"
                      value={userGpsArea}
                      onChange={(e) => setUserGpsArea(e.target.value)}
                      className="bg-amber-50/50 hover:bg-amber-50/80 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-extrabold text-amber-950 focus:outline-hidden px-3 py-2 rounded-lg transition-all text-xs border border-amber-200/60 flex-1"
                      placeholder="e.g. Mission District"
                    />
                  </div>
                </div>

                {/* 2. Anonymity Profile */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/70 shadow-2xs flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-slate-600 font-black text-[10px] uppercase tracking-wider">
                    <User className="h-3.5 w-3.5" />
                    <span>Citizen Profile Credentials</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                    Modify your anonymous community nickname and track your unique system cryptographic ID.
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="flex flex-col gap-1">
                      <span className="text-[8px] text-slate-400 font-bold uppercase">ID Badge</span>
                      <span className="font-mono bg-slate-50 px-2 py-1.5 rounded-lg text-[10px] text-slate-600 font-bold border border-slate-200/40 text-center truncate">
                        {userId ? userId.substring(0, 8) : "Connecting..."}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[8px] text-slate-400 font-bold uppercase">Nickname</span>
                      <input
                        type="text"
                        value={userNickname}
                        onChange={(e) => setUserNickname(e.target.value)}
                        className="bg-slate-50 hover:bg-slate-100/80 focus:bg-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold text-slate-800 focus:outline-hidden px-2 py-1 rounded-lg transition-colors text-xs border border-slate-200"
                        placeholder="Anonymous"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Citizen Reward Status */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/70 shadow-2xs flex flex-col gap-2 justify-between">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-wider">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Citizen Rep Karma</span>
                    </div>
                    {userProfile && (
                      <span className="font-black text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                        {userProfile.points} Karma pts
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                    Karma is awarded for submitting valid, community-verified civic reports and performing municipal reviews.
                  </p>
                  {userProfile && (
                    <div className="flex gap-1.5 flex-wrap mt-1">
                      {userProfile.badges.map((badge, idx) => (
                        <span key={idx} className="text-[9px] bg-indigo-50 text-indigo-800 px-2.5 py-1 rounded-lg font-black uppercase border border-indigo-100/50 flex items-center gap-1">
                          <span>🏅</span>
                          <span>{badge}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* MAIN APPLICATION CONTAINER */}
      {currentPath === "/admin" ? (
        isAdminAuthenticated ? (
          <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 flex-1 flex flex-col gap-6 animate-fade-in">
            {renderAdminDashboard()}
          </main>
        ) : (
          <main className="max-w-md mx-auto w-full px-4 py-16 flex-1 flex flex-col justify-center animate-fade-in">
            <div className="bg-white rounded-3xl border border-slate-200/85 p-8 shadow-xl flex flex-col gap-6 relative overflow-hidden">
              {/* Top ambient color accent */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-indigo-600"></div>
              
              <div className="flex flex-col items-center text-center gap-3">
                <div className="h-12 w-12 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-xs">
                  <Lock className="h-6 w-6" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Administrative Access</h2>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    This portal is restricted to municipal administrators. Enter the administrative password to manage issues and review hot zones.
                  </p>
                </div>
              </div>

              <form onSubmit={handleAdminPasswordSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Password</label>
                  <input
                    type="password"
                    value={adminPasswordInput}
                    onChange={(e) => {
                      setAdminPasswordInput(e.target.value);
                      if (passwordError) setPasswordError(null);
                    }}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-bold text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 focus:bg-white transition-all placeholder:text-slate-300"
                    autoFocus
                  />
                  {passwordError && (
                    <span className="text-[11px] text-rose-500 font-extrabold mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {passwordError}
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md shadow-indigo-100 hover:shadow-indigo-200 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Sign In
                </button>
              </form>

              <div className="border-t border-slate-100 pt-5 flex flex-col items-center gap-3">
                <div className="bg-slate-50 border border-slate-100 px-3.5 py-2.5 rounded-xl text-[10px] text-slate-500 text-center font-semibold leading-relaxed">
                  Demo Credentials: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200/50 text-indigo-700 font-black">admin123</code>
                </div>
                <button
                  onClick={() => navigateTo("/")}
                  className="text-xs font-black text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
                >
                  ← Return to Citizen View
                </button>
              </div>
            </div>
          </main>
        )
      ) : (
        <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* LEFT PANEL: FILTERS AND FEED LIST */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          
          {/* CONTROL BOX */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-indigo-500" />
                Filter Issues
              </h2>
              {viewMode === "view" && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleEnterReportMode}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600/95 backdrop-blur-md hover:bg-indigo-600 text-white font-bold text-xs shadow-md shadow-indigo-100 hover:shadow-indigo-200 border border-indigo-400/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Report Issue
                  </button>
                </div>
              )}
            </div>

            {/* SEARCH COMPONENT */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search descriptions or categories..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-4 py-2 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 text-slate-700 transition-all font-medium placeholder:text-slate-400"
              />
            </div>

            {/* FILTER DROPDOWNS & BADGES */}
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Category
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200/80 rounded-xl px-2.5 py-2 font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all cursor-pointer"
                >
                  <option value="all">All</option>
                  <option value="pothole">Pothole</option>
                  <option value="streetlight">Streetlight</option>
                  <option value="garbage">Garbage</option>
                  <option value="water_leak">Water Leak</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Severity
                </label>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200/80 rounded-xl px-2.5 py-2 font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all cursor-pointer"
                >
                  <option value="all">All</option>
                  <option value="high">🔥 High</option>
                  <option value="medium">⚡ Medium</option>
                  <option value="low">🌱 Low</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200/80 rounded-xl px-2.5 py-2 font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all cursor-pointer"
                >
                  <option value="all">All</option>
                  <option value="reported">Reported</option>
                  <option value="verified">Reviewed</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            </div>

            {/* SPAM TOGGLE */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3.5 text-xs">
              <span className="text-slate-500 font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Include AI Flagged Spam/Fakes
              </span>
              <button
                onClick={() => setShowSpam(!showSpam)}
                className={`relative inline-flex h-5 w-9.5 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  showSpam ? "bg-amber-500" : "bg-slate-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    showSpam ? "translate-x-4.5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* ISSUES FEED CONTAINER */}
          <div className="flex-1 overflow-y-auto max-h-[500px] lg:max-h-[calc(100vh-220px)] flex flex-col gap-3.5 pr-1">
            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center flex flex-col items-center justify-center gap-3 shadow-xs">
                <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
                <p className="text-xs text-slate-500 font-bold tracking-wide">Downloading latest community reports...</p>
              </div>
            ) : filteredIssues.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
                <div className="h-12 w-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3.5 shadow-inner">
                  <Info className="h-5.5 w-5.5 text-slate-400" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">No matching issues</h3>
                <p className="text-xs text-slate-400 mt-1.5 max-w-xs mx-auto leading-relaxed">
                  Try adjusting your filters, searching for something else, or toggling the AI spam filter.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredIssues.map((issue) => {
                  const colors = getCategoryColor(issue.category);
                  const isSelected = selectedIssue?.id === issue.id;

                  return (
                    <motion.div
                      layout
                      key={issue.id}
                      onClick={() => {
                        handleSelectIssue(issue);
                        setViewMode("view");
                        setMapCenter({ lat: issue.lat, lng: issue.lng });
                      }}
                      className={`group cursor-pointer rounded-2xl border p-4 transition-all duration-300 flex gap-4 text-left relative backdrop-blur-md ${
                        isSelected
                          ? "bg-indigo-50/70 border-indigo-500 ring-4 ring-indigo-500/10 shadow-lg shadow-indigo-100/30"
                          : "bg-white/80 border-slate-200/60 hover:bg-white/95 hover:border-indigo-200 hover:shadow-md hover:shadow-slate-100/40 hover:scale-[1.01] active:scale-[0.99]"
                      }`}
                    >
                      {/* Thumbnail photo or fallback icon */}
                      <div className="h-16 w-16 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0 relative shadow-inner flex items-center justify-center">
                        {issue.photoUrl ? (
                          <img
                            src={issue.photoUrl}
                            alt={getCategoryLabel(issue.category)}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-xl bg-slate-50">
                            {issue.category === "pothole" ? "🕳️" : issue.category === "streetlight" ? "💡" : issue.category === "garbage" ? "🗑️" : issue.category === "water_leak" ? "💧" : "⚠️"}
                          </div>
                        )}
                        {issue.is_spam && (
                          <div className="absolute inset-0 bg-rose-950/40 backdrop-blur-[1px] flex items-center justify-center" title="AI Flagged Spam">
                            <span className="bg-rose-500 text-white text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded-md uppercase">SPAM</span>
                          </div>
                        )}
                      </div>

                      {/* Summary details */}
                      <div className="flex-1 flex flex-col justify-between min-w-0">
                        <div>
                          <div className="flex items-center justify-between gap-1.5 mb-1.5 flex-wrap">
                            <span className={`text-[9px] uppercase tracking-wider px-2.5 py-0.5 rounded-full font-black border ${colors.bg} ${colors.text} ${colors.border}`}>
                              {getCategoryLabel(issue.category)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                              <Clock className="h-3 w-3 text-slate-300" />
                              {formatDate(issue.createdAt).split(",")[0]}
                            </span>
                          </div>
                          <h3 className="text-xs font-bold text-slate-900 truncate line-clamp-1 group-hover:text-indigo-600 transition-colors">
                            {issue.clean_description || issue.description}
                          </h3>
                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5 font-medium">
                            {issue.description}
                          </p>
                        </div>

                        {/* Interactive footer details */}
                        <div className="flex items-center justify-between mt-2.5 flex-wrap gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-bold uppercase border tracking-wider ${getSeverityColor(issue.severity)}`}>
                              {issue.severity}
                            </span>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-bold uppercase border tracking-wider ${getStatusColor(issue.status)}`}>
                              {issue.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
                            {(() => {
                              const hasUpvoted = issue.upvotedBy && issue.upvotedBy.includes(userId);
                              const isLocalResident = (userGpsArea && issue.area)
                                ? userGpsArea.trim().toLowerCase() === issue.area.trim().toLowerCase()
                                : false;
                              return (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpvote(issue.id);
                                  }}
                                  disabled={hasUpvoted || !isLocalResident}
                                  className={`flex items-center gap-1.5 p-1 px-2 rounded-lg transition-all border ${
                                    hasUpvoted
                                      ? "bg-emerald-50 border-emerald-200 text-emerald-700 font-extrabold cursor-not-allowed"
                                      : !isLocalResident
                                      ? "bg-slate-50 border-slate-200/60 text-slate-300 cursor-not-allowed"
                                      : "border-transparent hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100 cursor-pointer"
                                  }`}
                                  title={hasUpvoted ? "Already upvoted!" : (!isLocalResident ? "Only local residents can verify this issue." : "Upvote directly from list")}
                                >
                                  <ThumbsUp className={`h-3.5 w-3.5 ${hasUpvoted ? "text-emerald-600" : !isLocalResident ? "text-slate-300" : "text-slate-400"}`} />
                                  <span>{issue.upvotes}</span>
                                </button>
                              );
                            })()}
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                              <span>{issue.comments?.length || 0}</span>
                            </span>
                            <a
                              href={`/?issueId=${issue.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              className="flex items-center gap-1 border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 text-slate-500 hover:text-indigo-600 px-1.5 py-0.5 rounded-md transition-all cursor-pointer font-sans"
                              title="Open this issue in a new browser tab"
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span className="text-[10px] font-black uppercase tracking-wider">Open</span>
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Warning indicators on card if AI flagged */}
                      {(!issue.is_authentic || issue.is_spam) && (
                        <div className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-rose-500" title="Flagged report"></div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT PANEL: MAP ON TOP, DETAIL / REPORT FORM ON BOTTOM */}
        <section className="lg:col-span-7 flex flex-col gap-5 h-[600px] lg:h-[calc(100vh-100px)]">
          
          {/* TOP AREA: INTERACTIVE MAP */}
          <div className="h-[280px] lg:h-[40%] shrink-0">
            <CivicMap
              issues={issues}
              selectedIssue={selectedIssue}
              onIssueSelect={(issue) => {
                handleSelectIssue(issue);
                setViewMode("view");
                setMapCenter({ lat: issue.lat, lng: issue.lng });
              }}
              onMapClick={viewMode === "report" ? (lat, lng) => setReportLocation({ lat, lng }) : undefined}
              reportLocation={reportLocation}
              center={mapCenter}
            />
          </div>

          {/* BOTTOM AREA: DETAIL PANELS / FORM */}
          <div ref={detailPanelRef} className="flex-1 bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden flex flex-col min-h-0">
            <AnimatePresence mode="wait">
              
              {/* STATE 1: REPORT NEW ISSUE FORM */}
              {viewMode === "report" && (
                <motion.form
                  key="report-form"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  onSubmit={handleSubmitIssue}
                  className="p-6 flex flex-col gap-4.5 flex-1 overflow-y-auto"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                    <div>
                      <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                        <Plus className="h-4 w-4 text-indigo-600" />
                        Report a Civic Issue
                      </h2>
                      <p className="text-[11px] text-slate-400 font-medium">
                        Alert your neighborhood and have it immediately verified by Gemini AI.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setViewMode("view");
                        setReportLocation(null);
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 font-bold transition-all cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200"
                    >
                      Cancel
                    </button>
                  </div>

                  {/* FORM ERRORS */}
                  {formError && (
                    <div className="p-3 bg-rose-50 border border-rose-200/60 rounded-xl text-rose-800 text-xs flex items-center gap-2 font-semibold">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    {/* STEP 1: PHOTO UPLOAD */}
                    <div className="flex flex-col gap-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        1. Capture or Upload Photo <span className="text-slate-400 font-bold text-[9px] lowercase tracking-normal bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded ml-1.5 font-sans">optional</span>
                      </label>
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200 ${
                          isDragging
                            ? "border-indigo-500 bg-indigo-50/40"
                            : "border-slate-200 hover:border-indigo-400 bg-slate-50/30 hover:bg-slate-50/70"
                        }`}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        {formPhoto ? (
                          <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-200/80 shadow-xs group">
                            <img
                              src={formPhoto}
                              alt="Upload preview"
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute bottom-2.5 left-2.5 bg-black/75 backdrop-blur-xs text-[9px] text-white px-2.5 py-1 rounded-md font-bold tracking-wider uppercase border border-white/10">
                              Compressed: {formPhotoSize}KB / Max 500KB ✅
                            </div>
                            <div 
                              className="absolute top-2.5 right-2.5 bg-black/60 hover:bg-rose-600 backdrop-blur-xs text-white p-1.5 rounded-full transition-all cursor-pointer opacity-0 group-hover:opacity-100 shadow-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFormPhoto("");
                                setFormPhotoSize(0);
                              }} 
                              title="Remove photo"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="h-10 w-10 rounded-full bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-400 shadow-inner">
                              <ImageIcon className="h-4.5 w-4.5 text-slate-400" />
                            </div>
                            <div className="text-center">
                              <p className="text-xs font-bold text-slate-700">Drag & Drop photo here</p>
                              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">or click to browse local files</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* STEP 2: LOCATION SELECTOR */}
                    <div className="flex flex-col gap-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        2. Pinpoint Location <span className="text-rose-500">*</span>
                      </label>
                      <div className="bg-slate-50/50 border border-slate-200/80 rounded-2xl p-5 flex flex-col gap-3.5 shadow-xs">
                        <p className="text-[11px] text-slate-400 leading-relaxed font-semibold">
                          📍 Place the crosshair on the map above where the issue is, or fetch your device GPS coordinates.
                        </p>
                        <div className="flex flex-col gap-2.5">
                          <button
                            type="button"
                            onClick={handleUseCurrentLocation}
                            className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs hover:shadow-sm transition-all duration-200 cursor-pointer active:scale-[0.98]"
                          >
                            <Navigation className="h-3.5 w-3.5 text-indigo-500" />
                            Use My GPS Location
                          </button>
                          {reportLocation ? (
                            <div className="bg-emerald-50/40 border border-emerald-100 p-2.5 rounded-xl text-[10px] text-emerald-800 font-mono flex items-center justify-between font-bold shadow-xs">
                              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>LAT: {reportLocation.lat.toFixed(6)}</span>
                              <span>LNG: {reportLocation.lng.toFixed(6)}</span>
                            </div>
                          ) : (
                            <div className="bg-amber-50/40 border border-amber-100 p-2.5 rounded-xl text-[10px] text-amber-800 flex items-center gap-1.5 font-bold shadow-xs">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                              <span>No location pinned yet. Click on the map!</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* STEP 3: WRITTEN COMPLAINT */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="complaint-desc" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      3. Written Complaint Description <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      id="complaint-desc"
                      rows={3}
                      placeholder="Explain what the issue is (e.g. 'Streetlight out in front of bakery', 'Pothole in the bike lane causing cyclists to swerve into traffic'). Be specific!"
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-slate-200/80 rounded-xl p-3 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 resize-none leading-relaxed font-semibold placeholder:text-slate-400"
                    />
                  </div>

                  {/* SUBMIT ENGINE */}
                  <div className="mt-auto border-t border-slate-100 pt-4">
                    {isAnalyzing ? (
                      <div className="p-4 bg-indigo-50/40 border border-indigo-100/80 rounded-2xl flex flex-col gap-2 items-center justify-center text-center shadow-xs">
                        <Loader2 className="h-6 w-6 text-indigo-600 animate-spin" />
                        <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-indigo-500 animate-pulse" />
                          Gemini Intelligence Core
                        </h4>
                        <p className="text-[11px] text-indigo-500/80 font-bold animate-pulse">{analysisStage}</p>
                      </div>
                    ) : (
                      <button
                        type="submit"
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs tracking-wider uppercase rounded-xl shadow-lg shadow-indigo-100 hover:shadow-indigo-200 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Sparkles className="h-4 w-4" />
                        Analyze & Verify Issue with Gemini AI
                      </button>
                    )}
                  </div>
                </motion.form>
              )}

              {/* STATE 2: SELECTED ISSUE DETAILED CARD */}
              {viewMode === "view" && selectedIssue && (
                <motion.div
                  key="issue-details"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col flex-1 overflow-hidden min-h-0"
                >
                  {/* DETAIL BODY */}
                  <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
                    
                    {/* Header action row */}
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-[9px] uppercase tracking-wider px-2.5 py-0.5 rounded-full font-black border ${getCategoryColor(selectedIssue.category).bg} ${getCategoryColor(selectedIssue.category).text} ${getCategoryColor(selectedIssue.category).border}`}>
                            {getCategoryLabel(selectedIssue.category)}
                          </span>
                          <span className={`text-[9px] uppercase tracking-wider px-2.5 py-0.5 rounded-full font-black border ${getSeverityColor(selectedIssue.severity)}`}>
                            {selectedIssue.severity} SEVERITY
                          </span>
                        </div>
                        <h2 className="text-sm font-black text-slate-900 flex items-center gap-1 leading-snug">
                          {selectedIssue.clean_description || selectedIssue.description}
                        </h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1 mt-1">
                          <Clock className="h-3.5 w-3.5 text-slate-300" />
                          Submitted {formatDate(selectedIssue.createdAt)}
                        </p>
                      </div>

                      {/* Close detail / back view / share link */}
                      <div className="flex items-center gap-2">
                        <a
                          href={`/?issueId=${selectedIssue.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-[11px] text-indigo-700 hover:text-indigo-800 font-black tracking-wide uppercase transition-all cursor-pointer bg-indigo-50 border border-indigo-200/60 hover:bg-indigo-100/60 px-3 py-1.5 rounded-xl shadow-xs"
                          title="Open this issue's details in a new tab"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Open in Tab</span>
                        </a>
                        <button
                          onClick={() => handleSelectIssue(null)}
                          className="text-xs text-slate-500 hover:text-slate-800 font-bold transition-all cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200"
                        >
                          Clear Selection
                        </button>
                      </div>
                    </div>

                    {/* Large Photo & AI Verification Card */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4.5 items-stretch">
                      
                      {/* Image Viewer */}
                      <div className={`rounded-2xl overflow-hidden border border-slate-200/80 aspect-video md:aspect-auto relative flex flex-col items-center justify-center shadow-xs p-6 ${selectedIssue.photoUrl ? 'bg-slate-950' : 'bg-slate-50'}`}>
                        {selectedIssue.photoUrl ? (
                          <>
                            <img
                              src={selectedIssue.photoUrl}
                              alt="Civic issue photograph"
                              referrerPolicy="no-referrer"
                              className="max-h-full max-w-full object-contain"
                            />
                            <div className="absolute top-2.5 left-2.5 bg-black/70 backdrop-blur-xs text-[9px] text-slate-200 px-2.5 py-1 rounded-md font-mono font-bold tracking-wider uppercase">
                              ORIGINAL CAPTURE
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-2 text-center">
                            <span className="text-5xl">
                              {selectedIssue.category === "pothole" ? "🕳️" : selectedIssue.category === "streetlight" ? "💡" : selectedIssue.category === "garbage" ? "🗑️" : selectedIssue.category === "water_leak" ? "💧" : "⚠️"}
                            </span>
                            <span className="text-[10px] font-black tracking-widest uppercase text-slate-400 mt-2">Text-only report</span>
                            <p className="text-[10px] text-slate-400/80 font-semibold max-w-[180px] mt-1 leading-relaxed">No photo was attached by the reporting citizen.</p>
                          </div>
                        )}
                      </div>

                      {/* AI Verification Results */}
                      <div className="bg-slate-50/50 border border-slate-200/80 rounded-2xl p-5 flex flex-col justify-between gap-4.5 relative overflow-hidden shadow-inner">
                        
                        {/* Background subtle AI logo watermark */}
                        <Sparkles className="absolute -right-6 -bottom-6 h-24 w-24 text-slate-200/30 rotate-12 pointer-events-none" />

                        <div className="flex flex-col gap-3.5 z-10">
                          <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1.5">
                            <Sparkles className="h-4 w-4 text-indigo-500 animate-pulse" />
                            Gemini Core Verification
                          </h3>

                          {/* Authenticity result */}
                          <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
                            <span className="text-[11px] text-slate-500 font-bold">Image Authenticity</span>
                            {selectedIssue.is_authentic ? (
                              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full">
                                <CheckCircle className="h-3 w-3" />
                                Verified Real
                              </span>
                            ) : (
                              <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 flex items-center gap-1.5 bg-rose-50 border border-rose-100 px-2.5 py-0.5 rounded-full">
                                <XCircle className="h-3 w-3" />
                                Stock / Fake
                              </span>
                            )}
                          </div>

                          {/* Spam result */}
                          <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
                            <span className="text-[11px] text-slate-500 font-bold">Spam Filter Scan</span>
                            {selectedIssue.is_spam ? (
                              <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 flex items-center gap-1.5 bg-rose-50 border border-rose-100 px-2.5 py-0.5 rounded-full animate-pulse">
                                <AlertTriangle className="h-3 w-3" />
                                Spam Flagged
                              </span>
                            ) : (
                              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full">
                                <CheckCircle className="h-3 w-3" />
                                Safe Report
                              </span>
                            )}
                          </div>

                          {/* Reason block */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">AI Reasoning Breakdown</span>
                            <p className="text-[11px] text-slate-600 italic font-medium leading-relaxed">
                              "{selectedIssue.reasoning || "Verified by standard vision models."}"
                            </p>
                          </div>
                        </div>

                        {/* Coordinate indicator */}
                        <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between border-t border-slate-200/60 pt-2.5 z-10 mt-auto">
                          <span>LAT: {selectedIssue.lat ? selectedIssue.lat.toFixed(5) : "0.00000"}</span>
                          <span>LNG: {selectedIssue.lng ? selectedIssue.lng.toFixed(5) : "0.00000"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Citizen Complaint Block */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/80 flex flex-col gap-2 shadow-xs">
                      <h4 className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                        Citizen's Original Description
                      </h4>
                      <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                        {selectedIssue.description}
                      </p>
                    </div>

                    {/* Status Tracker & Administrative workflow simulator */}
                    <div className="border border-slate-200/80 rounded-2xl p-5 flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          Municipal Resolution Progress
                        </h4>
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black border uppercase tracking-wider ${getStatusColor(selectedIssue.status)}`}>
                          {selectedIssue.status}
                        </span>
                      </div>

                      {/* Interactive visual progress steps */}
                      <div className="relative flex items-center justify-between mt-1">
                        <div className="absolute left-0 right-0 h-0.5 bg-slate-100 top-3 -z-10"></div>
                        <div
                          className="absolute left-0 h-0.5 bg-indigo-600 top-3 -z-10 transition-all duration-300"
                          style={{
                            width:
                              (selectedIssue.status ? selectedIssue.status.toLowerCase() : "") === "reported"
                                ? "0%"
                                : (selectedIssue.status ? selectedIssue.status.toLowerCase() : "") === "verified"
                                ? "33%"
                                : (selectedIssue.status ? selectedIssue.status.toLowerCase() : "") === "in_progress"
                                ? "66%"
                                : "100%",
                          }}
                        ></div>

                        {["reported", "verified", "in_progress", "resolved"].map((step, idx) => {
                          const stepsOrder = ["reported", "verified", "in_progress", "resolved"];
                          const statusLower = selectedIssue.status ? selectedIssue.status.toLowerCase() : "reported";
                          const currentIdx = stepsOrder.indexOf(statusLower);
                          const isDone = idx <= currentIdx;

                          return (
                            <div key={step} className="flex flex-col items-center">
                              <div
                                className={`h-6.5 w-6.5 rounded-full flex items-center justify-center text-[10px] font-black border-2 transition-colors duration-200 ${
                                  isDone
                                    ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                                    : "bg-white border-slate-200 text-slate-400"
                                }`}
                              >
                                {idx + 1}
                              </div>
                              <span className={`text-[9px] font-extrabold uppercase mt-1.5 tracking-wider ${isDone ? "text-slate-700" : "text-slate-400"}`}>
                                {step.replace('_', ' ')}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Administrative Simulator Advance trigger */}
                      {selectedIssue.status !== "Resolved" && (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center justify-between gap-3 text-xs flex-wrap mt-1">
                          <span className="text-slate-500 font-bold">
                            🔧 Municipal Admin? Simulate crew dispatch:
                          </span>
                          <button
                            onClick={() => handleAdvanceStatus(selectedIssue.id, selectedIssue.status)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-[10px] tracking-wider uppercase rounded-lg transition-colors cursor-pointer"
                          >
                            Advance to {selectedIssue.status === "Reported" ? "Reviewed" : selectedIssue.status === "Reviewed" ? "In Progress" : "Resolved"} →
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Upvote support */}
                    {(() => {
                      const hasUpvoted = selectedIssue.upvotedBy && selectedIssue.upvotedBy.includes(userId);
                      const isLocalResident = (userGpsArea && selectedIssue.area)
                        ? userGpsArea.trim().toLowerCase() === selectedIssue.area.trim().toLowerCase()
                        : false;
                      return (
                        <div className="flex flex-col gap-2 border-t border-b border-slate-100 py-4.5 w-full">
                          <div className="flex items-center gap-3.5 flex-wrap">
                            <button
                              onClick={() => handleUpvote(selectedIssue.id)}
                              disabled={hasUpvoted || !isLocalResident}
                              title={hasUpvoted ? "Already upvoted!" : (!isLocalResident ? "Only local residents can verify this issue." : "Upvote this report")}
                              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-extrabold text-xs shadow-xs transition-all ${
                                hasUpvoted
                                  ? "bg-emerald-50 border border-emerald-200 text-emerald-700 cursor-not-allowed"
                                  : !isLocalResident
                                  ? "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                                  : "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md cursor-pointer active:scale-98"
                              }`}
                            >
                              <ThumbsUp className="h-4 w-4" />
                              {hasUpvoted ? "Upvoted!" : "Upvote report"}
                              <span className="ml-1.5 px-2 py-0.5 rounded-full bg-black/10 text-[10px] font-black">
                                {selectedIssue.upvotes}
                              </span>
                            </button>
                            <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
                              {selectedIssue.upvotes} community members verified this issue. Upvotes increase dispatch priority.
                            </p>
                          </div>
                          {!isLocalResident && !hasUpvoted && (
                            <div className="text-[10px] font-extrabold text-amber-600 bg-amber-50 border border-amber-200/60 rounded-xl px-3 py-2 flex items-center gap-1.5 w-fit">
                              <span>🔒 Upvoting restricted: Only local residents can verify this issue.</span>
                              <span className="text-[9px] text-slate-400 font-normal">(Your GPS: {userGpsArea} | Report Area: {selectedIssue.area})</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* COMMENTS BLOCK */}
                    <div className="flex flex-col gap-4">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <MessageSquare className="h-4 w-4 text-slate-400" />
                        Community Chat ({selectedIssue.comments?.length || 0})
                      </h3>

                      {/* Comment input form */}
                      <form onSubmit={handleAddComment} className="flex gap-2.5 items-end">
                        <div className="flex-1">
                          <textarea
                            rows={1}
                            placeholder={`Comment as ${userNickname}...`}
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            className="w-full text-xs bg-slate-50 border border-slate-200/80 rounded-xl p-3 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 text-slate-800 resize-none leading-relaxed font-semibold placeholder:text-slate-400"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={isSubmittingComment || !commentText.trim()}
                          className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs uppercase tracking-wider shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {isSubmittingComment ? "..." : "Send"}
                        </button>
                      </form>

                      {/* Comments feed list */}
                      <div className="flex flex-col gap-2.5 max-h-[250px] overflow-y-auto pr-1">
                        {(!selectedIssue.comments || selectedIssue.comments.length === 0) ? (
                          <p className="text-[11px] text-slate-400 italic py-2 font-medium">
                            No comments submitted yet. Join the conversation and coordinate repairs!
                          </p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {selectedIssue.comments.map((comment) => (
                              <div key={comment.id} className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl flex flex-col gap-1 text-left">
                                <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-slate-400">
                                  <span className="text-slate-700 font-extrabold">{comment.userNickname}</span>
                                  <span>{formatDate(comment.createdAt)}</span>
                                </div>
                                <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                                  {comment.text}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STATE 3: DESKTOP EMPTY STATE (NOTHING SELECTED) */}
              {viewMode === "view" && !selectedIssue && (
                <motion.div
                  key="empty-state"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col items-center justify-center p-8 text-center flex-1"
                >
                  <div className="h-16 w-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 border border-indigo-100 shadow-xs">
                    <MapPin className="h-6 w-6 text-indigo-500" />
                  </div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Explore community dashboard</h3>
                  <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed font-semibold">
                    Select any reported issue from the left panel to examine verified facts, review AI confidence rates, upvote, or discuss remedies.
                  </p>
                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={handleEnterReportMode}
                      className="px-4 py-2.5 bg-indigo-600/95 backdrop-blur-md text-white font-black text-xs uppercase tracking-wider rounded-xl hover:bg-indigo-600 shadow-md shadow-indigo-100 hover:shadow-indigo-200/80 border border-indigo-400/20 transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                    >
                      Report a New Issue
                    </button>
                    <button
                      onClick={() => {
                        // Pick a random issue from the feed to showcase if list is present
                        if (issues.length > 0) {
                          const rand = issues[Math.floor(Math.random() * issues.length)];
                          handleSelectIssue(rand);
                          setMapCenter({ lat: rand.lat, lng: rand.lng });
                        }
                      }}
                      className="px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-wider rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
                    >
                      Showcase random report
                    </button>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </section>

      </main>
      )}

      {/* FOOTER METADATA */}
      <footer className="bg-slate-100 border-t border-slate-200 py-3 text-center text-[10px] text-slate-400 font-medium tracking-wide">
        CivPort Civic Portal • Powered by Google Gemini AI Model & Firebase Firestore • All actions logged anonymously
      </footer>

      {/* Toast Notification Container */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -20, x: 20 }}
            className={`fixed top-4 right-4 z-[9999] flex items-center gap-3 px-4.5 py-3 rounded-2xl border text-xs font-bold shadow-xl backdrop-blur-md transition-all ${
              toast.type === "error"
                ? "bg-rose-50/95 border-rose-200 text-rose-800 shadow-rose-100/30"
                : "bg-emerald-50/95 border-emerald-200 text-emerald-800 shadow-emerald-100/30"
            }`}
          >
            <div className={`h-2 w-2 rounded-full ${toast.type === "error" ? "bg-rose-600" : "bg-emerald-600"} animate-pulse`} />
            <span>{toast.message}</span>
            <button 
              onClick={() => setToast(null)}
              className="ml-2 hover:text-slate-900 transition-colors cursor-pointer text-sm font-normal"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
