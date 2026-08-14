import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import NewBill from "./pages/NewBill";
import Friends from "./pages/Friends";
import BillDetail from "./pages/BillDetail";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/new-bill" element={<ProtectedRoute><NewBill /></ProtectedRoute>} />
      <Route path="/friends" element={<ProtectedRoute><Friends /></ProtectedRoute>} />
      <Route path="/bills/:id" element={<ProtectedRoute><BillDetail /></ProtectedRoute>} />
    </Routes>
  );
}

export default App;