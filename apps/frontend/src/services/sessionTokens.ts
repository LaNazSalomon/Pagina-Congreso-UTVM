let personal = "";
let participante = "";
export const sessionTokens = {
  get personal() {
    return personal;
  },
  get participante() {
    return participante;
  },
  setPersonal(value: string) {
    personal = value;
  },
  setParticipante(value: string) {
    participante = value;
  }
};
