import mariadb from "mariadb";
import dotenv from "dotenv";
import { ADDRESS_LENGTH, DATABASE_NAME, TABLE_NAME } from "../staticVariables";

dotenv.config();

const pool = mariadb.createPool({
  host: "mariadb",
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  connectionLimit: 50,
  database: DATABASE_NAME,
});

export async function createDatabase() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${DATABASE_NAME}`);
  } catch (error) {
    throw new Error(`Failed to create database: ${error}`);
  } finally {
    if (connection) await connection.release();
  }
}

async function createTable() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query(
      `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (user_address VARCHAR(${ADDRESS_LENGTH}) NOT NULL, pending_withdrawal VARCHAR(40) NOT NULL, pending_date DATETIME NOT NULL, group_address VARCHAR(${ADDRESS_LENGTH}) NOT NULL, executed BOOLEAN NOT NULL DEFAULT 0, PRIMARY KEY (pending_date))`
    );
  } catch (error) {
    throw new Error(`Failed to create table: ${error}`);
  } finally {
    if (connection) await connection.release();
  }
}

export async function compareTimestamp(latestBlockTimestamp: string): Promise<[]> {
  let connection;
  try {
    connection = await pool.getConnection();
    const exists = await connection.query(`SHOW TABLES LIKE '${TABLE_NAME}'`);

    if (exists.length === 0) {
      return [];
    }

    const results = await connection.query(
      `SELECT DISTINCT user_address FROM ${TABLE_NAME} WHERE pending_date < FROM_UNIXTIME(${latestBlockTimestamp}) AND executed = 0`
    );

    return results;
  } catch (error) {
    throw new Error(`Failed to compare with database: ${error}`);
  } finally {
    if (connection) await connection.release();
  }
}

export async function updateExecutionStatus(localTimestamp: number) {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query(
      `UPDATE ${TABLE_NAME} SET executed = 1 WHERE pending_date=FROM_UNIXTIME(${localTimestamp})`
    );
  } catch (error) {
    throw new Error(`Failed to update execution status: ${error}`);
  } finally {
    if (connection) await connection.release();
  }
}

export async function addPendingWithdrawal(
  userAddress: string,
  withdrawalAmount: string,
  unlockTimestamp: string,
  groupAddress: string
) {
  let connection;
  try {
    connection = await pool.getConnection();
    await createTable();
    await connection.query(
      `INSERT INTO ${TABLE_NAME} (user_address, pending_withdrawal, pending_date, group_address) VALUES ('${userAddress}', ${withdrawalAmount}, FROM_UNIXTIME(${unlockTimestamp}), '${groupAddress}')`
    );
  } catch (error) {
    throw new Error(`Failed to add withdrawal to ${TABLE_NAME} table: ${error}`);
  } finally {
    if (connection) await connection.release();
  }
}
