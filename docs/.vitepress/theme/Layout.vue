<script setup lang="ts">
import { onMounted, ref } from "vue";
import DefaultTheme from "vitepress/theme";
import DocsAssistant from "../components/DocsAssistant.vue";

const showAssistant = ref(false);
onMounted(() => {
  showAssistant.value = true;
});
</script>

<template>
  <DefaultTheme.Layout>
    <template #layout-bottom>
      <DocsAssistant v-if="showAssistant" />
    </template>
  </DefaultTheme.Layout>
</template>
