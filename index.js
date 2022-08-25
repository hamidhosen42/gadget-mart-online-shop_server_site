const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
var nodemailer = require("nodemailer");
const mg = require("nodemailer-mailgun-transport");

const app = express();
const port = process.env.PORT || 5000;

// midleware
app.use(cors());
app.use(express.json());

// require('crypto').randomBytes(64).toString('hex')

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.aqmpm.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    console.log("sdfsds");
    const partCollection = client.db("bicycle_manufacturer").collection("part");
    const reviewCollection = client
      .db("bicycle_manufacturer")
      .collection("review");
    const orderCollection = client
      .db("bicycle_manufacturer")
      .collection("order");
    const userCollection = client.db("bicycle_manufacturer").collection("user");
    const paymentCollection = client
      .db("bicycle_manufacturer")
      .collection("payments");

    // make addmin then add a user-done
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    };

    // ----------admin secrion------------

    // load all user-done
    app.get("/user", async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    // load admin user-done
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    //put admin in db existing email
    app.put("/user/admin/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // DELETE user----done
    app.delete("/user/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // ----------payment section----------

    // post payment db -done
    app.post("/create-payment-intent", async (req, res) => {
      const service = req.body;
      const price = service.totalprice;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // update admin panding user payment than user pay
    app.put("/shiped/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          paid: "true",
        },
      };
      const updatedorder = await orderCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(updatedorder);
    });

    // update payment history-done
    app.patch("/order/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: "false",
          transactionId: payment.transactionId,
        },
      };

      const result = await paymentCollection.insertOne(payment);
      const updatedorder = await orderCollection.updateOne(filter, updatedDoc);
      res.send({ updatedorder, result });
    });

    // -----------------user section---------------

    // User Creation and update accesstoken-done
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );
      res.send({ result, token });
    });

    // ----------------order section-----------

    // upload order
    app.post("/order", verifyJWT, async (req, res) => {
      const orders = req.body;
      const result = await orderCollection.insertOne(orders);
      res.send(result);
    });

    //My Order load-done
    app.get("/order", async (req, res) => {
      const orderEmail = req.query.orderEmail;
      const query = { email: orderEmail };
      const orders = await orderCollection.find(query).toArray();
      res.send(orders);
    });

    // admin add order load
    app.get("/orders", async (req, res) => {
      const query = {};
      const orders = await orderCollection.find(query).toArray();
      res.send(orders);
    });

    // load payment order id db-done
    app.get("/order/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const order = await orderCollection.findOne(query);
      res.send(order);
    });

    // DELETE order----
    app.delete("/order/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await orderCollection.deleteOne(query);
      res.send(result);
    });

    // --------------review section--------------

    // Add a review  upload db----
    app.post("/review", verifyJWT, async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });

    //load data part API-----done
    app.get("/reviews", async (req, res) => {
      const query = {};
      const cursor = reviewCollection.find(query);
      const part = await cursor.toArray();
      res.send(part);
    });

    // ------------profile section -------

    // update user profile
    app.put("/profile/:email", async (req, res) => {
      const email = req.params.email;
      const profileUser = req.body;
      const options = { upsert: true };
      const filter = { email: email };
      const updateDoc = {
        $set: {
          displayName: profileUser.displayName,
          email: profileUser.email,
          education: profileUser.education,
          address: profileUser.address,
          number: profileUser.number,
          linkdin: profileUser.linkdin,
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    // load  user profile
    app.get("/profile/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      res.send(user);
    });

    // ------parts item-----------

    //load data part API-----done
    app.get("/part", async (req, res) => {
      const query = {};
      const cursor = partCollection.find(query);
      const part = await cursor.toArray();
      res.send(part);
    });

    //load part details-done
    app.get("/part/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const part = await partCollection.findOne(query);
      res.send(part);
    });

    // Add a part  upload db----
    app.post("/addProduct", verifyJWT, async (req, res) => {
      const parts = req.body;
      const result = await partCollection.insertOne(parts);
      res.send(result);
    });

    // delete parts item
    app.delete("/part/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await partCollection.deleteOne(query);
      res.send(result);
    });
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello From bicycle!");
});

app.listen(port, () => {
  console.log(`bicycle App listening on port ${port}`);
});