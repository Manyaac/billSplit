import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await api.post("/auth/login", { emailOrUsername, password });
      login(res.data.user, res.data.token);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Login failed");
    }
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="bg-paper rounded-2xl shadow-md p-8 w-full max-w-sm flex flex-col gap-4"
      >
        <h1 className="font-hand text-5xl text-moss text-center mb-2">
          welcome back
        </h1>

        {error && (
          <p className="text-coral text-sm font-body text-center">{error}</p>
        )}

        <input
          type="text"
          placeholder="email or username"
          value={emailOrUsername}
          onChange={(e) => setEmailOrUsername(e.target.value)}
          className="font-body px-4 py-2 rounded-lg border border-moss/30 bg-cream focus:outline-none focus:ring-2 focus:ring-leaf"
        />
        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="font-body px-4 py-2 rounded-lg border border-moss/30 bg-cream focus:outline-none focus:ring-2 focus:ring-leaf"
        />

        <button
          type="submit"
          className="font-body font-semibold bg-leaf text-white py-2 rounded-lg hover:bg-moss transition-colors"
        >
          log in
        </button>

        <p className="font-body text-sm text-center text-ink/70">
          new here?{" "}
          <Link to="/signup" className="text-moss underline">
            create an account
          </Link>
        </p>
      </form>
    </div>
  );
}