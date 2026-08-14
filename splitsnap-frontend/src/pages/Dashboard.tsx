import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

interface Bill {
  id: string;
  title: string | null;
  totalAmount: number;
  splitMode: string;
  createdAt: string;
}

export default function Dashboard() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/bills")
      .then((res) => setBills(res.data))
      .catch((err) => console.error("Failed to load bills:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Minimal top nav — friends now lives on the bill page itself */}
      <div className="flex justify-between items-center px-6 py-4">
        <span className="font-hand text-2xl text-moss">splitsnap*</span>
        <div className="flex gap-3 items-center">
          <Link
            to="/friends"
            className="font-body text-xs text-ink/50 underline hover:text-moss transition-colors"
          >
            manage friends
          </Link>
          <button
            onClick={handleLogout}
            className="font-body text-xs px-3 py-1.5 rounded-full border border-coral text-coral hover:bg-coral hover:text-white transition-colors"
          >
            log out
          </button>
        </div>
      </div>

      {/* Hero — centered, spacious */}
      <div className="flex flex-col items-center justify-center text-center px-6 py-16">
        <h1 className="font-hand text-6xl text-moss mb-2">
          hey, {user?.username} 👋
        </h1>
        <p className="font-body text-ink/60 mb-8">
          your bills, split cozy and simple
        </p>
        <Link
          to="/new-bill"
          className="font-body font-semibold bg-leaf text-white px-8 py-3 rounded-full hover:bg-moss transition-colors shadow-sm"
        >
          + snap a new receipt
        </Link>
      </div>

      {/* Bills — centered container */}
      <div className="flex-1 px-6 pb-16 flex justify-center">
        <div className="w-full max-w-4xl">
          {loading ? (
            <p className="font-body text-ink/60 text-center">loading your bills...</p>
          ) : bills.length === 0 ? (
            <div className="bg-paper rounded-2xl p-10 text-center">
              <p className="font-body text-ink/70">
                no bills yet — snap a receipt to get started
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {bills.map((bill) => (
                <Link
                  key={bill.id}
                  to={`/bills/${bill.id}`}
                  className="receipt-card bg-paper p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <h2 className="font-hand text-2xl text-moss mb-1">
                    {bill.title || "untitled bill"}
                  </h2>
                  <p className="font-mono text-lg text-coral">
                    ₹{bill.totalAmount.toFixed(2)}
                  </p>
                  <p className="font-body text-xs text-ink/50 mt-2">
                    {bill.splitMode.toLowerCase()} split
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}