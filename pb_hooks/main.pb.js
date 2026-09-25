/// <reference path="../pb_data/types.d.ts" />

// PocketBase só descobre ficheiros *.pb.js diretamente no hooksDir. A lógica
// permanece organizada e testável em validation/, sendo carregada aqui pelo
// mecanismo CommonJS incorporado no JSVM.
require(`${__hooks}/validation/ownership.pb.js`)
require(`${__hooks}/validation/user-cascade.pb.js`)
