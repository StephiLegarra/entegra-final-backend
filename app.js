import express from "express";
import Handlebars from "handlebars";
import expressHandlebars from "express-handlebars";
import { allowInsecurePrototypeAccess } from "@handlebars/allow-prototype-access";
import __dirname from "./utils.js";
import { Server } from "socket.io";
import MongoStore from "connect-mongo";
import productsRouter from "./routes/products.router.js";
import cartsRouter from "./routes/carts.router.js";
import sessionsRouter from "./routes/sessions.router.js";
import viewsRouter from "./routes/view.router.js";
import emailRouter from './routes/email.router.js';
import smsRouter from './routes/sms.router.js';
import mockingRouter from "./moking/mock.router.js";
import loggerRouter from "./routes/logger.router.js";
import userRouter from "./routes/users.router.js";
import paymentRouter from "./routes/payments.router.js";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "passport";
import initializePassport from "./middleware/passport.js"; 
import initializeGitHubPassport from "./middleware/github.js";
import cors from "cors";
import { addLogger, devLogger } from "./config/logger.js";
import MongoSingleton from "./config/mongoConfig.js";
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUIExpress from 'swagger-ui-express';

//EXPRESS
const app = express();

// SERVER HTTP
const httpServer = app.listen(process.env.PORT || 8080, () => {devLogger.info(`Servidor inicializado en puerto ${process.env.PORT}`)});
// SOCKET SERVER
export const socketServer = new Server(httpServer);
app.set("socketServer", socketServer);

app.engine("handlebars",
  expressHandlebars.engine({handlebars: allowInsecurePrototypeAccess(Handlebars)}));

app.set("views", __dirname + "/views");
app.set("view engine", "handlebars");
app.use(express.static(__dirname));

//MONGO SINGLETON
const mongoInstance = async () => {
  try {
      await MongoSingleton.getInstance();
  } catch (error) {
      console.error(error);
  }
};
mongoInstance();

//SWAGGER
const swaggerOptions = {
  definition: {
      openapi: "3.0.1",
      info: {
          title: "Documentacion API PokeShop",
          description: "Documentacion para uso de swagger"
      }
  },
  apis: [`./docs/**/*.yaml`] 
};
const specs = swaggerJSDoc(swaggerOptions);

//SESSION
app.use(cookieParser());
app.use(session({
    store: new MongoStore({
      mongoUrl: process.env.MONGODB_URL,
      collectionName:"sessions"
    }),
    secret: process.env.SECRET_SESSIONS,
    resave: false,
    saveUninitialized: false,
    cookie: {secure:false}
  }));
initializeGitHubPassport();
initializePassport();
app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(__dirname + "/public"));
app.use("/images", express.static(__dirname + "/src/public/images"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(addLogger);

app.use('/apidocs', swaggerUIExpress.serve, swaggerUIExpress.setup(specs));
app.use("/api/products/", productsRouter);
app.use("/api/carts/", cartsRouter);
app.use("/api/sessions/", sessionsRouter);
app.use("/", viewsRouter);
app.use("/api/email", emailRouter);
app.use("/api/sms", smsRouter);
app.use("/api/mockingproducts", mockingRouter);
app.use("/loggerTest", loggerRouter);
app.use("/api/users", userRouter);
app.use("/payment", paymentRouter);

app.use(cors({
  credentials:true,
  method: ["GET", "POST", "PUT", "DELETE"]
})); 

//IMPORT
import ProductManager from "./dao/ProductManager.js";
const PM = new ProductManager();

import ChatManager from "./dao/ChatManager.js";
const chat = new ChatManager();

import CartManager from "./dao/CartManager.js";
const CM = new CartManager();

import UserManager from "./dao/UserManager.js";
const UM = new UserManager();

// APERTURA SOCKET ON
socketServer.on("connection", async (socket) => {
  console.log("Conexión establecida");

  // PRODUCTOS REAL TIME
  const allProducts = await PM.getProducts();
  socket.emit("initial_products", allProducts);

  // CREAR PRODUCTO
  socket.on("addProduct", async (obj) => {
    await PM.addProduct(obj);
    const productsList = await PM.getProductsViews();
    socketServer.emit("envioDeProductos", productsList);
  });

  //ELIMINAR PRODUCTO POR ID
  socket.on("deleteProduct",async(id)=>{
    const productsList = await PM.getProductsViews();
    await PM.deleteProduct(id);
    socketServer.emit("envioDeProductos", productsList);
    });

  socket.on("eliminarProducto", (data)=>{
    PM.deleteProduct(parseInt(data));
    const productsList = PM.getProducts();
    socketServer.emit("envioDeProductos", productsList);
  });

  // CONEXION USUARIO
  socket.on("nuevoUsuario",(usuario)=>{
    console.log("usuario", usuario);
    socket.broadcast.emit("broadcast", usuario);
    });

  socket.on("disconnect", ()=>{
    console.log("Usuario desconectado");
    });

  //CHAT
  socket.on("mensajeChat", async (data) => {
    chat.createMessage(data);
    const messages = await chat.getMessages();
    const updateInterval = 2000;
    setInterval(() => {
      socket.emit("messages", messages);
    }, updateInterval);
  });
});
