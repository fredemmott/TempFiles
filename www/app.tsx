/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import React, {lazy} from "react"
import ReactDOM from "react-dom/client"
import {BrowserRouter, Routes, Route} from "react-router"

const IndexPage = lazy(() => import("./pages/index"));
const RegisterPage = lazy(() => import("./pages/register"));
const LoginPage = lazy(() => import("./pages/login"));

const root = document.getElementById("root")!

import './app.css';

ReactDOM.createRoot(root).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<IndexPage/>}/>
      <Route path="/login" element={<LoginPage/>}/>
      <Route path="/register" element={<RegisterPage/>}/>
    </Routes>
  </BrowserRouter>
);