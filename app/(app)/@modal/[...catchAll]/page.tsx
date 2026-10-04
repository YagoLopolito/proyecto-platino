/**
 * Cualquier otra navegación cierra el modal: sin este catch-all, el slot
 * conservaría la publicación abierta al ir, por ejemplo, del modal a la ficha
 * del juego.
 */
export default function ModalCatchAll() {
  return null;
}
