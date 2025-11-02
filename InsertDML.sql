INSERT INTO Patient(email,password,name,address,gender)
VALUES
('ramesh@gmail.com','hrishikesh13','Ramesh','Tamil Nadu','male'),
('suresh@gmail.com','hrishikesh13','Suresh','Karnataka','male'),
('rakesh@gmail.com','hrishikesh13','Rakesh','Gujarat','male')
ON CONFLICT DO NOTHING;

INSERT INTO MedicalHistory(id,date,conditions,surgeries,medication)
VALUES
(1,'2019-01-14','Pain in abdomen','Heart Surgery','Crocin'),
(2,'2019-01-14','Frequent Indigestion','none','none'),
(3,'2019-01-14','Body Pain','none','Iodex')
ON CONFLICT DO NOTHING;

INSERT INTO Doctor(email,gender,password,name)
VALUES
('hathalye7@gmail.com','male','hrishikesh13','Hrishikesh Athalye'),
('hathalye8@gmail.com','male','hrishikesh13','Hrishikesh Athalye')
ON CONFLICT DO NOTHING;

INSERT INTO Appointment(id,date,starttime,endtime,status)
VALUES
(1,'2019-01-15','09:00','10:00','Done'),
(2,'2019-01-16','10:00','11:00','Done'),
(3,'2019-01-18','14:00','15:00','Done')
ON CONFLICT DO NOTHING;

INSERT INTO PatientsAttendAppointments(patient,appt,concerns,symptoms)
VALUES
('ramesh@gmail.com',1,'none','itchy throat'),
('suresh@gmail.com',2,'infection','fever'),
('rakesh@gmail.com',3,'nausea','fever')
ON CONFLICT DO NOTHING;

INSERT INTO Schedule(id,starttime,endtime,breaktime,day)
VALUES
(1,'09:00','17:00','12:00','Tuesday'),
(2,'09:00','17:00','12:00','Friday'),
(3,'09:00','17:00','12:00','Saturday'),
(4,'09:00','17:00','12:00','Sunday'),
(5,'09:00','17:00','12:00','Wednesday'),
(6,'09:00','17:00','12:00','Friday')
ON CONFLICT DO NOTHING;

INSERT INTO PatientsFillHistory(patient,history)
VALUES
('ramesh@gmail.com',1),
('suresh@gmail.com',2),
('rakesh@gmail.com',3)
ON CONFLICT DO NOTHING;

INSERT INTO Diagnose(appt,doctor,diagnosis,prescription)
VALUES
(1,'hathalye7@gmail.com','Bloating','Ibuprofen as needed'),
(2,'hathalye8@gmail.com','Muscle soreness','Stretch morning/night'),
(3,'hathalye8@gmail.com','Vitamin Deficiency','Good Diet')
ON CONFLICT DO NOTHING;

INSERT INTO DocsHaveSchedules(sched,doctor)
VALUES
(1,'hathalye7@gmail.com'),
(5,'hathalye8@gmail.com')
ON CONFLICT DO NOTHING;

INSERT INTO DoctorViewsHistory(history,doctor)
VALUES
(1,'hathalye7@gmail.com'),
(2,'hathalye8@gmail.com'),
(3,'hathalye8@gmail.com')
ON CONFLICT DO NOTHING;
