var createError = require('http-errors');
var express = require('express');
var path = require('path');
//Logger that was used for debugging, commented later
// var logger = require('morgan');
require('dotenv').config();

var cors = require('cors');
var port = 3001
const { Pool } = require('pg');
//Connection Info
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://neondb_owner:npg_DonPvW37ZIRM@ep-wild-mode-a4a0lbkl-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect()
    .then(() => console.log("✅ Connected to NeonDB (PostgreSQL)"))
    .catch(err => console.error("❌ Connection error", err.stack));


//Variables to keep state info about who is logged in
var email_in_use = "";
var password_in_use = "";
var who = "";

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

//Signup, Login, Password Reset Related Queries

//Checks if patient exists in database
app.get('/checkIfPatientExists', async(req, res) => {
    const { email } = req.query;

    try {
        const statement = 'SELECT * FROM Patient WHERE email = $1';
        console.log('Executing:', statement, [email]);

        const result = await pool.query(statement, [email]);

        if (result.rows.length > 0) {
            console.log("returend true")
            return res.json({ exists: true, data: result.rows });

        } else {
            console.log("returend false")
            return res.json({ exists: false, message: 'Patient not found' });
        }
    } catch (error) {
        console.error('❌ Error checking patient existence:', error);
        return res.status(500).json({ error: 'Database query failed' });
    }
});


//Creates User Account
app.get('/makeAccount', async(req, res) => {
    const query = req.query;
    const name = `${query.name} ${query.lastname}`;
    const email = query.email;
    const password = query.password;
    const address = query.address;
    const gender = query.gender;

    const medications = query.medications || 'none';
    const conditions = query.conditions || 'none';
    const surgeries = query.surgeries || 'none';

    try {
        // 1️⃣ Insert patient
        const insertPatient = `
      INSERT INTO Patient (email, password, name, address, gender)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING email;
    `;
        console.log('Insert Patient:', insertPatient, [email, password, name, address, gender]);
        await pool.query(insertPatient, [email, password, name, address, gender]);

        // 2️⃣ Insert into MedicalHistory (Postgres uses CURRENT_DATE)
        const insertHistory = `
      INSERT INTO MedicalHistory (date, conditions, surgeries, medication)
      VALUES (CURRENT_DATE, $1, $2, $3)
      RETURNING id;
    `;
        console.log('Insert MedicalHistory:', insertHistory, [conditions, surgeries, medications]);
        const historyResult = await pool.query(insertHistory, [conditions, surgeries, medications]);
        const generated_id = historyResult.rows[0].id;

        // 3️⃣ Link Patient ↔ History
        const link = `
      INSERT INTO PatientsFillHistory (patient, history)
      VALUES ($1, $2);
    `;
        console.log('Insert PatientsFillHistory:', link, [email, generated_id]);
        await pool.query(link, [email, generated_id]);

        // 4️⃣ Set session-like variables (if used globally)
        email_in_use = email;
        password_in_use = password;
        who = 'pat';

        return res.json({
            success: true,
            message: 'Account created successfully',
            patient: { email, name, gender, address },
            medicalHistoryId: generated_id,
        });
    } catch (error) {
        console.error('❌ Error creating account:', error);
        return res.status(500).json({ error: 'Database error', details: error.message });
    }
});

//Checks If Doctor Exists
app.get('/checkIfDocExists', (req, res) => {
    const email = req.query.email;

    // ✅ Validate input
    if (!email) {
        return res.status(400).json({ error: "Missing 'email' query parameter" });
    }

    // ✅ Use parameterized SQL (safe)
    const statement = `SELECT * FROM Doctor WHERE email = $1`;

    console.log("Executing:", statement, [email]);

    pool.query(statement, [email], (error, results) => {
        if (error) {
            console.error("❌ Database query error:", error);
            return res.status(500).json({ error: "Database query failed" });
        }

        // ✅ Return structured response
        return res.json({
            data: results.rows,
            exists: results.rows.length > 0
        });
    });
});


//Makes Doctor Account
app.get('/makeDocAccount', async(req, res) => {
    const { name, lastname, email, password, gender, schedule } = req.query;
    const fullName = `${name} ${lastname}`;

    try {
        // Insert doctor first
        const insertDoctorQuery = `
      INSERT INTO Doctor (email, gender, password, name)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
        const doctorResult = await pool.query(insertDoctorQuery, [email, gender, password, fullName]);

        // Then assign schedule
        const insertScheduleQuery = `
      INSERT INTO DocsHaveSchedules (sched, doctor)
      VALUES ($1, $2)
      RETURNING *;
    `;
        const scheduleResult = await pool.query(insertScheduleQuery, [schedule, email]);

        // You can store session data if needed
        email_in_use = email;
        password_in_use = password;
        who = 'doc';

        console.log('✅ Doctor created:', doctorResult.rows[0]);
        console.log('🗓️ Schedule assigned:', scheduleResult.rows[0]);

        res.json({
            success: true,
            doctor: doctorResult.rows[0],
            schedule: scheduleResult.rows[0]
        });

    } catch (error) {
        console.error('❌ Error creating doctor account:', error);
        res.status(500).json({ error: 'Failed to create doctor account' });
    }
});


//Checks if patient is logged in
app.get('/checklogin', async(req, res) => {
    const { email, password } = req.query;

    try {
        const sql = `SELECT * FROM Patient WHERE email = $1 AND password = $2`;
        const result = await pool.query(sql, [email, password]);

        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        email_in_use = result.rows[0].email;
        password_in_use = result.rows[0].password;
        who = 'pat';

        // success
        console.log('✅ User found:', result.rows[0]);

        res.json({ data: result.rows });

    } catch (error) {
        console.error('❌ Database error:', error);
        res.status(500).json({ failed: 'Database error' });
    }
});


//Checks if doctor is logged in
app.get('/checkDoclogin', async(req, res) => {
    const { email, password } = req.query;

    // ✅ Validate input
    if (!email || !password) {
        return res.status(400).json({ error: "Missing email or password" });
    }

    try {
        // ✅ Parameterized query (prevents SQL injection)
        const sql = `
      SELECT * FROM Doctor
      WHERE email = $1 AND password = $2
    `;

        const result = await pool.query(sql, [email, password]);

        if (result.rows.length === 0) {
            // ❌ No doctor found
            return res.status(401).json({ error: "Invalid email or password" });
        }

        // ✅ Doctor found
        const doctor = result.rows[0];

        // Store session-like info (avoid in production)
        email_in_use = doctor.email;
        password_in_use = doctor.password;
        who = "doc";

        console.log("✅ Doctor login:", email_in_use);

        return res.json({
            success: true,
            doctor,
        });

    } catch (error) {
        console.error("❌ Database query error:", error);
        return res.status(500).json({ error: "Database query failed" });
    }
});

//Resets Patient Password
app.post('/resetPasswordPatient', async(req, res) => {
    try {
        const { email, oldPassword, newPassword } = req.query;
        const sql = `
      UPDATE Patient
      SET password = $1
      WHERE email = $2 AND password = $3
      RETURNING email;
    `;
        const result = await pool.query(sql, [newPassword, email, oldPassword]);
        res.json({ success: result.rowCount > 0 });
    } catch (error) {
        console.error('❌ Error resetting patient password:', error);
        res.status(500).json({ error: 'Database error' });
    }
});


//Resets Doctor Password
app.post('/resetPasswordDoctor', (req, res) => {
    let something = req.query;
    let email = something.email;
    let oldPassword = "" + something.oldPassword;
    let newPassword = "" + something.newPassword;
    let statement = `UPDATE Doctor
                   SET password = "${newPassword}"
                   WHERE email = "${email}"
                   AND password = "${oldPassword}";`;
    console.log(statement);
    pool.query(statement, function(error, results, fields) {
        if (error) throw error;
        else {
            return res.json({
                data: results
            })
        };
    });
});

//Returns Who is Logged in
app.get('/userInSession', (req, res) => {
    return res.json({ email: `${email_in_use}`, who: `${who}` });
});

//Logs the person out
app.get('/endSession', (req, res) => {
    console.log("Ending session");
    email_in_use = "";
    password_in_use = "";
});

//Appointment Related

//Checks If a similar appointment exists to avoid a clash
app.get('/checkIfApptExists', async(req, res) => {
    const { email, docEmail, startTime, date } = req.query;

    if (!email || !docEmail || !startTime || !date) {
        return res.status(400).json({ error: "Missing required parameters" });
    }

    try {
        const sqlDate = new Date(date).toISOString().split("T")[0]; // e.g. 2025-11-02

        // 1️⃣ Check if patient already has appointment at that date & time
        const query1 = `
      SELECT *
      FROM PatientsAttendAppointments p
      JOIN Appointment a ON p.appt = a.id
      WHERE p.patient = $1 AND a.date::date = $2::date AND a.starttime = $3
    `;
        const res1 = await pool.query(query1, [email, sqlDate, startTime]);

        // 2️⃣ Check if doctor has overlapping appointments
        const query2 = `
      SELECT *
      FROM Diagnose d
      JOIN Appointment a ON d.appt = a.id
      WHERE d.doctor = $1
        AND a.date::date = $2::date
        AND a.status = 'NotDone'
        AND $3::time >= a.starttime
        AND $3::time < a.endtime
    `;
        const res2 = await pool.query(query2, [docEmail, sqlDate, startTime]);

        // 3️⃣ Check if doctor is available (not during break)
        const query3 = `
      SELECT doctor, starttime, endtime, breaktime, day
      FROM DocsHaveSchedules
      JOIN Schedule ON DocsHaveSchedules.sched = Schedule.id
      WHERE doctor = $1
        AND LOWER(day) = TO_CHAR($2::date, 'Day')
        AND (
          ($3::time + interval '1 hour') <= breaktime
          OR $3::time >= (breaktime + interval '1 hour')
        )
    `;
        const res3 = await pool.query(query3, [docEmail, sqlDate, startTime]);

        const doctorAvailable = res3.rows.length > 0;

        return res.json({
            data: {
                patientAppointments: res1.rows,
                doctorOverlaps: res2.rows,
                doctorAvailable
            }
        });
    } catch (error) {
        console.error("❌ Error checking appointment:", error);
        return res.status(500).json({ error: "Database error while checking appointment" });
    }
});

//Returns Date/Time of Appointment
app.get('/getDateTimeOfAppt', async(req, res) => {
    const { id } = req.query;
    try {
        const sql = `
      SELECT starttime AS start, endtime AS end, date AS theDate
      FROM Appointment
      WHERE id = $1;
    `;
        const result = await pool.query(sql, [id]);
        res.json({ data: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get appointment info' });
    }
});


//Patient Info Related

//to get all doctor names
app.get('/docInfo', async(req, res) => {
    try {
        const statement = 'SELECT * FROM Doctor';
        console.log("🟢 Executing:", statement);

        const result = await pool.query(statement);

        return res.json({
            data: result.rows, // ✅ PostgreSQL returns rows instead of results[]
        });
    } catch (error) {
        console.error('❌ Error fetching doctor info:', error);
        return res.status(500).json({ error: 'Failed to fetch doctor info' });
    }
});


//To return a particular patient history
app.get('/OneHistory', async(req, res) => {
    const { patientEmail } = req.query;
    const sql = `
    SELECT p.gender, p.name, p.email, p.address,
           m.conditions, m.surgeries, m.medication
    FROM Patient p
    JOIN PatientsFillHistory pf ON p.email = pf.patient
    JOIN MedicalHistory m ON pf.history = m.id
    WHERE p.email = $1;
  `;
    const result = await pool.query(sql, [patientEmail]);
    res.json({ data: result.rows });
});

//To show all patients whose medical history can be accessed
app.get('/MedHistView', async(req, res) => {
    try {
        const { name } = req.query;
        const doctorEmail = email_in_use; // Keep using global variable

        if (!doctorEmail) {
            return res.status(400).json({ error: "No doctor is currently logged in." });
        }

        // 🧠 Base query
        let query = `
      SELECT
        p.name AS "Name",
        pfh.history AS "ID",
        p.email AS "Email"
      FROM Patient p
      JOIN PatientsFillHistory pfh ON p.email = pfh.patient
      WHERE p.email IN (
        SELECT pa.patient
        FROM PatientsAttendAppointments pa
        JOIN Diagnose d ON pa.appt = d.appt
        WHERE d.doctor = $1
      )
    `;

        const values = [doctorEmail];

        // 🧩 Optional filter by patient name
        if (name && name.trim() !== "") {
            query += ` AND p.name ILIKE $2`;
            values.push(`%${name}%`);
        }

        console.log("🟢 Executing:", query, values);

        // 🚀 Execute safely
        const result = await pool.query(query, values);

        // 🧾 Response
        return res.json({
            data: result.rows,
        });

    } catch (error) {
        console.error("❌ Database query error:", error);
        return res.status(500).json({ error: "Database query failed" });
    }
});


//Returns Appointment Info To patient logged In
app.get('/patientViewAppt', (req, res) => {
    const email = req.query.email;

    // 1️⃣ Validate input
    if (!email) {
        return res.status(400).json({ error: "Missing 'email' query parameter" });
    }

    // 2️⃣ Use PostgreSQL parameterized query
    const statement = `
    SELECT
      p.appt AS id,
      p.patient AS user,
      p.concerns AS concerns,
      p.symptoms AS symptoms,
      a.date AS date,
      a.starttime AS start_time,
      a.endtime AS end_time,
      a.status AS status
    FROM PatientsAttendAppointments p
    JOIN Appointment a ON p.appt = a.id
    WHERE p.patient = $1;
  `;

    // 3️⃣ Execute safely
    pool.query(statement, [email], (error, results) => {
        if (error) {
            console.error("❌ Database query error:", error);
            return res.status(500).json({ error: "Database query failed" });
        }

        // 4️⃣ Handle empty results
        if (results.rows.length === 0) {
            return res.status(404).json({ message: "No appointments found for this patient." });
        }

        // 5️⃣ Return data in consistent format
        return res.json({ data: results.rows });
    });
});

//Checks if history exists
app.get('/checkIfHistory', async(req, res) => {
    try {
        const { email } = req.query;
        const sql = `SELECT patient FROM PatientsFillHistory WHERE patient = $1`;
        const result = await pool.query(sql, [email]);
        res.json({ exists: result.rowCount > 0, data: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Database query failed' });
    }
});


//Adds to PatientsAttendAppointment Table
app.get('/addToPatientSeeAppt', async(req, res) => {
    try {
        const { email, id: appt_id, concerns, symptoms } = req.query;

        if (!email || !appt_id) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        const sql = `
      INSERT INTO PatientsAttendAppointments (patient, appt, concerns, symptoms)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

        console.log("🟢 Executing:", sql, [email, appt_id, concerns, symptoms]);

        const result = await pool.query(sql, [email, appt_id, concerns, symptoms]);

        return res.json({
            success: true,
            data: result.rows[0],
        });
    } catch (error) {
        console.error("❌ Error inserting appointment:", error);
        return res.status(500).json({ error: "Failed to add appointment" });
    }
});

//Schedules Appointment
app.get('/schedule', (req, res) => {
    const { time, date, id, endTime, concerns, symptoms, doc } = req.query;

    // ✅ 1️⃣ Validate input
    if (!id || !time || !endTime || !date || !doc) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    // ✅ 2️⃣ Convert date/time properly
    const formattedDate = new Date(date);
    if (isNaN(formattedDate)) {
        return res.status(400).json({ error: "Invalid date format" });
    }

    // ✅ 3️⃣ Prepare queries with parameterized values
    const appointmentQuery = `
    INSERT INTO Appointment (id, date, starttime, endtime, status)
    VALUES (?, ?, ?, ?, ?);
  `;

    const appointmentValues = [id, formattedDate, time, endTime, "NotDone"];

    // ✅ 4️⃣ Execute safely
    pool.query(appointmentQuery, appointmentValues, (error, results) => {
        if (error) {
            console.error("❌ Appointment insert error:", error);
            return res.status(500).json({ error: "Failed to schedule appointment" });
        }

        // ✅ 5️⃣ Insert Diagnose entry after appointment succeeds
        const diagnoseQuery = `
      INSERT INTO Diagnose (appt, doctor, diagnosis, prescription)
      VALUES (?, ?, ?, ?);
    `;

        const diagnoseValues = [id, doc, "Not Yet Diagnosed", "Not Yet Diagnosed"];

        pool.query(diagnoseQuery, diagnoseValues, (error2, results2) => {
            if (error2) {
                console.error("❌ Diagnose insert error:", error2);
                return res.status(500).json({ error: "Failed to create diagnosis entry" });
            }

            // ✅ 6️⃣ Return successful response
            return res.json({
                message: "Appointment scheduled successfully",
                appointment: results,
                diagnosis: results2
            });
        });
    });
});

//Generates ID for appointment
app.get('/genApptUID', async(req, res) => {
    try {
        const statement = 'SELECT id FROM Appointment ORDER BY id DESC LIMIT 1;';
        const result = await pool.query(statement);

        // ✅ Handle case where no rows exist
        const lastId = result.rows.length > 0 ? result.rows[0].id : 0;

        const generated_id = lastId + 1;

        res.json({ id: generated_id });
    } catch (error) {
        console.error('❌ Error generating appointment UID:', error);
        res.status(500).json({ error: 'Failed to generate appointment ID' });
    }
});

//To fill diagnoses
app.get('/diagnose', async(req, res) => {
    try {
        const { id, diagnosis, prescription } = req.query;
        await pool.query(
            `UPDATE Diagnose SET diagnosis = $1, prescription = $2 WHERE appt = $3`, [diagnosis, prescription, id]
        );
        await pool.query(
            `UPDATE Appointment SET status = 'Done' WHERE id = $1`, [id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update diagnosis' });
    }
});




//To show appointments to doctor
app.get('/doctorViewAppt', async(req, res) => {
    const email = email_in_use;

    if (!email) {
        return res.status(400).json({ error: 'Missing doctor email parameter' });
    }

    const query = `
    SELECT
      a.id,
      a.date,
      a.starttime,
      a.status,
      p.name,
      pa.concerns,
      pa.symptoms
    FROM Appointment a
    JOIN PatientsAttendAppointments pa ON a.id = pa.appt
    JOIN Patient p ON pa.patient = p.email
    WHERE a.id IN (SELECT appt FROM Diagnose WHERE doctor = $1);
  `;

    try {
        console.log('🟢 Executing:', query, [email]);
        const { rows } = await pool.query(query, [email]);
        return res.json({ data: rows });
    } catch (error) {
        console.error('❌ Error fetching doctor appointments:', error);
        return res.status(500).json({ error: 'Failed to fetch doctor appointments' });
    }
});


//To show diagnoses to patient
app.get('/showDiagnoses', async(req, res) => {
    try {
        const { id } = req.query;

        // ✅ 1️⃣ Validate input
        if (!id) {
            return res.status(400).json({ error: "Missing 'id' query parameter" });
        }

        // ✅ 2️⃣ Safe, parameterized SQL query
        const statement = `SELECT * FROM Diagnose WHERE appt = $1`;
        console.log("🟢 Executing:", statement, [id]);

        // ✅ 3️⃣ Execute query
        const result = await pool.query(statement, [id]);

        // ✅ 4️⃣ Return structured response
        return res.json({
            data: result.rows
        });

    } catch (error) {
        console.error("❌ Error fetching diagnosis:", error);
        return res.status(500).json({ error: "Failed to fetch diagnosis details" });
    }
});

//To Show all diagnosed appointments till now
app.get('/allDiagnoses', async(req, res) => {
    let { patientEmail } = req.query;

    if (!patientEmail) {
        return res.status(400).json({ error: 'Missing patientEmail parameter' });
    }

    // 🧹 Remove any accidental surrounding quotes
    patientEmail = patientEmail.replace(/^['"]|['"]$/g, '');

    const query = `
    SELECT
      A.date,
      D.doctor,
      B.concerns,
      B.symptoms,
      D.diagnosis,
      D.prescription
    FROM Appointment A
    INNER JOIN PatientsAttendAppointments B ON A.id = B.appt
    INNER JOIN Diagnose D ON B.appt = D.appt
    WHERE B.patient = $1;
  `;

    try {
        console.log('🟢 Executing:', query, [patientEmail]);
        const { rows } = await pool.query(query, [patientEmail]);
        console.log("rows", rows);
        return res.json({ data: rows });
    } catch (error) {
        console.error('❌ Error fetching all diagnoses:', error);
        return res.status(500).json({ error: 'Database query failed' });
    }
});


//To delete appointment
app.get('/deleteAppt', async(req, res) => {
    try {
        const { uid } = req.query;
        const result = await pool.query(`SELECT status FROM Appointment WHERE id = $1`, [uid]);

        if (result.rows.length === 0) return res.status(404).json({ error: 'Appointment not found' });
        const status = result.rows[0].status;

        if (status === 'NotDone') {
            await pool.query(`DELETE FROM Appointment WHERE id = $1`, [uid]);
        } else {
            await pool.query(`DELETE FROM PatientsAttendAppointments WHERE appt = $1`, [uid]);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete appointment' });
    }
});


// If 404, forward to error handler
app.use(function(req, res, next) {
    next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

app.listen(port, () => {
    console.log(`Listening on port ${port} `);
});

module.exports = app;