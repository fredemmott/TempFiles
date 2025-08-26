import React from "react"
import ReactDOM from "react-dom/client"
import {BrowserRouter, Routes, Route} from "react-router"
import Register from "./pages/register"

const root = document.getElementById("root")!

ReactDOM.createRoot(root).render(
  <BrowserRouter>
    <Routes>
      <Route path="/register" element={<Register/>}/>
    </Routes>
  </BrowserRouter>
);