// memory.utils.js
// Helper utilities for the memory test module
export function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}
