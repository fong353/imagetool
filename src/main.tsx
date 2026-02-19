import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css"; // 👈 统一改成大写 A

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);