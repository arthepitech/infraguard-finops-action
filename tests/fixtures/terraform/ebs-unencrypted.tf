resource "aws_ebs_volume" "unencrypted_big_gp2" {
  availability_zone = "us-east-1a"
  size              = 1000
  type              = "gp2"
}

resource "aws_instance" "with_unencrypted_root" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.small"

  root_block_device {
    volume_size = 100
    encrypted   = false
  }
}

resource "aws_db_instance" "unencrypted_db" {
  identifier        = "legacy-db"
  engine            = "mysql"
  instance_class    = "db.t3.medium"
  allocated_storage = 1500
}
