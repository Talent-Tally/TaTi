import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import TaTiHome from "../components/TaTiHome.vue";
import Layout from "./Layout.vue";
import "./style.css";

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("TaTiHome", TaTiHome);
  },
} satisfies Theme;
