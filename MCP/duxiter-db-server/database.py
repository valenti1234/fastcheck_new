import os
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# MongoDB connection string
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = os.getenv("DB_NAME", "dux2")

# Create a MongoDB client
client = None

def get_database():
    """
    Get a database connection
    """
    global client
    if client is None:
        client = MongoClient(MONGO_URI)
    return client[DB_NAME]

def get_collection(collection_name):
    """
    Get a collection from the database
    """
    db = get_database()
    return db[collection_name]

def close_connection():
    """
    Close the MongoDB connection
    """
    global client
    if client:
        client.close()
        client = None

# Collections - aligned with server models
def get_companies_collection():
    """
    Get the CompanyDetails collection (aligned with server)
    """
    return get_collection("companydetails")

def get_risks_collection():
    """
    Get the CompanyRisks collection (aligned with server)
    """
    return get_collection("companyrisks")

def get_results_collection():
    """
    Get the Results collection (aligned with server)
    """
    return get_collection("results")