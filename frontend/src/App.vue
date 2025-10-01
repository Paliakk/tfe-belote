<template>
  <div>
    <RouterView />
    <!-- Modal outlet; rendered on top when route includes ?modal=stats etc. -->
    <RouterView name="modal" />
  </div>
</template>

<script setup lang="ts"></script>