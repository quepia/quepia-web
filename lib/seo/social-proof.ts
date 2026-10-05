// Solo agregar testimonios con autorización y logos de clientes con permiso de uso.
export const socialProof: {
  testimonials: { quote: string; name: string; role?: string }[];
  logos: { name: string; src: string }[];
} = { testimonials: [], logos: [] };
