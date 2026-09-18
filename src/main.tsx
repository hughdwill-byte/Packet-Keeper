import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import App from "./App";
import HomePage from "./pages/HomePage";
import UploadPage from "./pages/UploadPage";
import RecipePage from "./pages/RecipePage";
import EditPage from "./pages/EditPage";
import SettingsPage from "./pages/SettingsPage";
import PricesPage from "./pages/PricesPage";

// Hash routing so deep links survive a page refresh on GitHub Pages.
const router = createHashRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "upload", element: <UploadPage /> },
      { path: "recipe/:slug", element: <RecipePage /> },
      { path: "recipe/:slug/edit", element: <EditPage /> },
      { path: "prices", element: <PricesPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
