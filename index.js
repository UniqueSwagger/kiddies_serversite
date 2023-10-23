const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// stripe
const stripe = require("stripe")(
  "sk_test_51Jx0AjCvip3LZhpPERJsyqojcd723oPTY1FVU7OxHZwnbnqon32WOUDs1hr5P8KDkCTjTL6UQTyuuLvSADV0kX6H00lPEyq4PM"
);

//firebase admin configuration
const admin = require("firebase-admin");
const serviceAccount = require("./kiddies-educare-firebase-adminsdk.json");
try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
    }),
  });
} catch (error) {
  console.error("Firebase Admin SDK initialization error:", error);
}

app.get("/", (req, res) => res.send("Kiddies Educare Server is running"));

// jwt token
const verifyIdToken = async (req, res, next) => {
  if (req?.headers?.authorization.startsWith("Bearer ")) {
    const idToken = req.headers.authorization.split("Bearer ")[1];
    try {
      const decodedUser = await admin.auth().verifyIdToken(idToken);
      req.decodedEmail = decodedUser.email;
      next();
    } catch (e) {
      res.status(401).send("Unauthorized");
    }
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.spl8q.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function run() {
  try {
    await client.connect();
    const database = client.db("Kiddies_Educare");
    const userCollection = database.collection("users");
    const eventCollection = database.collection("events");
    const imageCollection = database.collection("gallery");
    const productCollection = database.collection("products");
    const orderCollection = database.collection("orders");
    //post user, get users, get particular user by emailId, replace firebase google sign in or github sign in user info, role play updating for admin, get admin by emailId
    app
      .post("/users", async (req, res) => {
        const user = req.body;
        const result = await userCollection.insertOne(user);
        res.send(result);
      })
      .get("/users", async (req, res) => {
        const result = await userCollection.find({}).toArray();
        res.send(result);
      })
      .get("/users/:emailId", async (req, res) => {
        const result = await userCollection.findOne({
          email: req.params.emailId,
        });
        res.send(result);
      })
      .put("/users", async (req, res) => {
        const result = await userCollection.updateOne(
          { email: req.body.email },
          { $set: req.body },
          { upsert: true }
        );
        res.send(result);
      });

    //role play updating for admin
    app.put("/users/admin", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    //getting admin
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      console.log(user);
      let isAdmin = false;
      if (user?.role === "admin") {
        isAdmin = true;
      }
      res.send({ admin: isAdmin });
    });

    //post an event, get all event
    app
      .post("/events", async (req, res) => {
        const event = req.body;
        const result = await eventCollection.insertOne(event);
        res.send(result);
      })
      .get("/events", async (req, res) => {
        const result = await eventCollection.find({}).toArray();
        res.send(result);
      });

    //get gallery images, post gallery image
    app
      .get("/gallery", async (req, res) => {
        const result = await imageCollection.find({}).toArray();
        res.send(result);
      })
      .post("/gallery", async (req, res) => {
        const galleryImage = req.body;
        const result = await imageCollection.insertOne(galleryImage);
        res.send(result);
      });

    //get products
    app
      .get("/products", async (req, res) => {
        const result = await productCollection.find({}).toArray();
        res.send(result);
      })
      .post("/product", async (req, res) => {
        const product = req.body;
        const result = await productCollection.insertOne(product);
        res.send(result);
      });

    //delete any product
    app.delete("/product/:id", async (req, res) => {
      const id = req.params.id;
      const result = await productCollection.deleteOne({ _id: ObjectId(id) });
      res.send(result);
    });

    // payment method
    app.post("/create-payment-intent", async (req, res) => {
      // Create a PaymentIntent with the order amount and currency
      const paymentMoney = req.body.totalAddedProductsPrice.toFixed(2);
      if (paymentMoney) {
        const amount = paymentMoney * 100;
        const paymentIntent = await stripe.paymentIntents.create({
          currency: "usd",
          amount: amount,
          payment_method_types: ["card"],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      }
    });

    //post order
    app
      .post("/orders", async (req, res) => {
        const order = req.body;
        const result = await orderCollection.insertOne(order);
        res.send(result);
      })
      .get("/orders", async (req, res) => {
        const result = await orderCollection.find({}).toArray();
        res.send(result);
      })
      .get("/orders/:email", verifyIdToken, async (req, res) => {
        if (req.decodedEmail === req.params.email) {
          const result = await orderCollection
            .find({ email: req.params.email })
            .toArray();
          res.send(result);
        } else {
          res.status(401).send("Unauthorized");
        }
      });
    //get order by email id params
    app.get("/order/:id", async (req, res) => {
      const email = req.params.id;
      const result = await orderCollection.find({ email: email }).toArray();
      res.send(result);
    });

    //delete any order
    app.delete("/registeredOrder/:id", async (req, res) => {
      const id = req.params.id;
      const result = await orderCollection.deleteOne({ _id: ObjectId(id) });
      res.send(result);
    });

    //update status
    app.put("/registeredOrder/:id", async (req, res) => {
      const newStatus = req.body.status;
      const filter = { _id: ObjectId(req.params.id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          status: newStatus,
        },
      };
      const result = await orderCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });
  } finally {
    //await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => console.log(`listening to the port on ${port}`));
