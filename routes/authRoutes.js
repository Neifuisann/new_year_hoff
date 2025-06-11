const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const { supabase } = require('../utils/supabaseClient');
const { username, passwordHash } = require('../config/adminCredentials');

// Admin login
router.post('/login', async (req, res) => {
  const { username: user, password } = req.body;
  try {
    if (!user || !password) {
      return res.status(400).json({ success: false, message: 'Missing username or password' });
    }
    const credentialsMatch = user === username && await bcrypt.compare(password, passwordHash);
    if (!credentialsMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    req.session.isAuthenticated = true;
    delete req.session.studentId;
    delete req.session.studentName;
    req.session.save(err => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ success: false, message: 'Session error' });
      }
      res.json({ success: true, message: 'Login successful' });
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Student registration
router.post('/register', async (req, res) => {
  const { full_name, date_of_birth, phone_number, password } = req.body;
  if (!full_name || !phone_number || !password) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  try {
    const { data: existingUser, error: checkError } = await supabase
      .from('students')
      .select('id')
      .eq('phone_number', phone_number)
      .maybeSingle();
    if (checkError) {
      console.error('Error checking for existing user:', checkError);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Số điện thoại này đã được đăng ký. Vui lòng sử dụng số điện thoại khác.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const { error: insertError } = await supabase
      .from('students')
      .insert({
        full_name,
        phone_number,
        date_of_birth,
        password_hash: hashedPassword,
        is_approved: false,
        created_at: new Date().toISOString()
      });
    if (insertError) {
      console.error('Error inserting new student:', insertError);
      return res.status(500).json({ success: false, message: 'Failed to create account' });
    }
    res.json({ success: true, message: 'Registration successful! Please wait for admin approval.' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Student login
router.post('/student/login', async (req, res) => {
  const { phone_number, password, device_fingerprint } = req.body;
  if (!phone_number || !password) {
    return res.status(400).json({ success: false, message: 'Missing phone number or password' });
  }
  try {
    const { data: student, error: fetchError } = await supabase
      .from('students')
      .select('id, full_name, password_hash, is_approved, approved_device_fingerprint')
      .eq('phone_number', phone_number)
      .maybeSingle();
    if (fetchError) {
      console.error('Error fetching student:', fetchError);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
    if (!student) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại.' });
    }
    if (!student.is_approved) {
      return res.status(401).json({ success: false, message: 'Tài khoản của bạn đang chờ được giáo viên phê duyệt.' });
    }
    const passwordMatch = await bcrypt.compare(password, student.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Mật khẩu không chính xác.' });
    }
    if (student.approved_device_fingerprint && student.approved_device_fingerprint !== device_fingerprint) {
      return res.status(401).json({ success: false, message: 'Bạn chỉ có thể đăng nhập từ thiết bị đã đăng ký trước đó.' });
    }
    if (device_fingerprint && !student.approved_device_fingerprint) {
      const { error: updateError } = await supabase
        .from('students')
        .update({ approved_device_fingerprint: device_fingerprint })
        .eq('id', student.id);
      if (updateError) console.error('Error updating device fingerprint:', updateError);
    }
    req.session.studentId = student.id;
    req.session.studentName = student.full_name;
    res.json({ success: true, message: 'Đăng nhập thành công!', student: { id: student.id, name: student.full_name } });
  } catch (error) {
    console.error('Student login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/student/logout', (req, res) => {
  try {
    delete req.session.studentId;
    delete req.session.studentName;
    res.json({ success: true, message: 'Đăng xuất thành công' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/admin/logout', (req, res) => {
  try {
    req.session.destroy(err => {
      if (err) {
        console.error('Admin logout error - session destroy failed:', err);
        return res.status(500).json({ success: false, message: 'Logout failed' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true, message: 'Admin logout successful' });
    });
  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
