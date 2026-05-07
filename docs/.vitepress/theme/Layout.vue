<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import DocsAssistant from "../components/DocsAssistant.vue";
</script>

<template>
  <DefaultTheme.Layout>
    <template #layout-bottom>
      <DocsAssistant />
    </template>
  </DefaultTheme.Layout>
</template>
